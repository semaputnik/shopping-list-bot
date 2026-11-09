import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  authenticate,
  createList,
  deleteList,
  fetchLists,
  joinList,
  leaveList,
  renameList,
  updateLanguage,
  type ShoppingList,
  type User,
} from "./api";
import { pickLanguage, t, type Language } from "./i18n";
import { HistoryScreen } from "./screens/HistoryScreen";
import { ListScreen } from "./screens/ListScreen";
import { MembersScreen } from "./screens/MembersScreen";
import { Message } from "./screens/Message";
import { SettingsScreen } from "./screens/SettingsScreen";
import { openEventStream, type Remote } from "./sync";
import { haptic, onActivated, startTelegram } from "./telegram";

type State =
  | { kind: "loading" }
  | { kind: "not-telegram" }
  | { kind: "error" }
  | { kind: "bad-link"; token: string; user: User; lists: ShoppingList[] }
  | {
      kind: "ready";
      token: string;
      user: User;
      lists: ShoppingList[];
      currentId: number | null;
      screen: Screen;
    };

type Screen = "list" | "members" | "settings" | "history";

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const backToList = useCallback(
    () => setState((s) => (s.kind === "ready" ? { ...s, screen: "list" } : s)),
    [],
  );
  const [language, setLanguage] = useState<Language>(() =>
    pickLanguage(navigator.language),
  );
  const [failed, setFailed] = useState(false);
  // Told to the Member when the List they were viewing disappears under them.
  const [notice, setNotice] = useState<string | null>(null);
  const [remote, setRemote] = useState<Remote>({ seq: 0, kind: "catchup", listId: null, version: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;
  const languageRef = useRef(language);
  languageRef.current = language;
  // Lists this user left or deleted themselves: their disappearance is no news.
  const ownRemovals = useRef(new Set<number>());
  const syncing = useRef({ running: false, again: false });
  // Why each List was last announced as changed or gone (event kind), to word the notice.
  const lastKind = useRef(new Map<number, string>());
  const lastCatchUp = useRef(0);
  const syncTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // The failure toast hides itself.
  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => setFailed(false), 4000);
    return () => clearTimeout(timer);
  }, [failed]);

  const boot = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      // startTelegram() is memoised, so Retry only repeats auth and the List fetch.
      const telegram = await startTelegram();
      if (!telegram) {
        setState({ kind: "not-telegram" });
        return;
      }
      setLanguage(pickLanguage(telegram.languageCode));
      const session = await authenticate(telegram.rawInitData);
      let lists = await fetchLists(session.token);
      setLanguage(session.user.language);
      let currentId = lists[0]?.id ?? null;
      if (session.start_param) {
        // Opening a Share link joins the List (a no-op for a Member) and opens it.
        try {
          const joined = await joinList(session.token, session.start_param);
          lists = [joined, ...lists.filter((l) => l.id !== joined.id)];
          currentId = joined.id;
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
          setState({ kind: "bad-link", token: session.token, user: session.user, lists });
          return;
        }
      }
      setState({
        kind: "ready",
        token: session.token,
        user: session.user,
        lists,
        currentId,
        screen: "list",
      });
    } catch (error) {
      console.error(error);
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  /** Runs a List mutation, then reloads the Lists (ordered by recent change) from the server. */
  const mutate = useCallback(
    async (run: (token: string) => Promise<number | null | undefined>): Promise<boolean> => {
      if (state.kind !== "ready") return false;
      try {
        // `run` returns the id to show next, or undefined to keep the current List.
        const next = await run(state.token);
        const lists = await fetchLists(state.token);
        setFailed(false);
        setState((prev) => {
          if (prev.kind !== "ready") return prev;
          const wanted = next === undefined ? prev.currentId : next;
          const currentId = lists.some((l) => l.id === wanted) ? wanted : (lists[0]?.id ?? null);
          return { ...prev, lists, currentId };
        });
        haptic.success();
        return true;
      } catch (error) {
        console.error(error);
        setFailed(true);
        haptic.error();
        return false;
      }
    },
    [state],
  );

  /**
   * Reloads the user's Lists after a change elsewhere (renames, Members, new or removed Lists).
   * Overlapping calls coalesce into one more run. If the List on screen is gone, the Member is
   * told and moved to another List.
   */
  const syncLists = useCallback(async () => {
    const run = syncing.current;
    if (run.running) {
      run.again = true;
      return;
    }
    run.running = true;
    try {
      do {
        run.again = false;
        const before = stateRef.current;
        if (before.kind !== "ready") return;
        const lists = await fetchLists(before.token);
        const now = stateRef.current;
        if (now.kind !== "ready") return;
        const gone =
          now.currentId !== null && !lists.some((l) => l.id === now.currentId)
            ? now.lists.find((l) => l.id === now.currentId)
            : undefined;
        if (gone && !ownRemovals.current.has(gone.id)) {
          const strings = t(languageRef.current);
          const text =
            lastKind.current.get(gone.id) === "member.left"
              ? strings.listLeftNotice
              : strings.listDeletedNotice;
          setNotice(text.replace("{name}", gone.name));
          haptic.error();
        }
        setState((prev) => {
          if (prev.kind !== "ready") return prev;
          const stillThere = lists.some((l) => l.id === prev.currentId);
          return {
            ...prev,
            lists,
            currentId: stillThere ? prev.currentId : (lists[0]?.id ?? null),
            screen: stillThere ? prev.screen : "list",
          };
        });
      } while (run.again);
    } catch (error) {
      console.warn("could not refresh the Lists", error);
    } finally {
      run.running = false;
    }
  }, []);

  // Realtime: one event stream for all the user's Lists. Each change refreshes the Lists and
  // tells the List screen; after a (re)connect or coming back to the app, everything is
  // caught up through `changes?since=`.
  const token = state.kind === "ready" ? state.token : null;
  useEffect(() => {
    if (token === null) return;
    const catchUp = () => {
      // Coming back to the app fires visibilitychange and isMiniAppActive together: run once.
      const now = Date.now();
      if (now - lastCatchUp.current < 1000) return;
      lastCatchUp.current = now;
      void syncLists();
      setRemote((r) => ({ seq: r.seq + 1, kind: "catchup", listId: null, version: 0 }));
    };
    const close = openEventStream(token, {
      onReady: catchUp,
      onChange: (event) => {
        lastKind.current.set(event.list_id, event.kind);
        // Renames, Members and removals change the Lists now. Entry changes only reorder the
        // switcher (most recently changed first), so a burst of checks is coalesced.
        if (event.kind.startsWith("list.") || event.kind.startsWith("member.")) {
          window.clearTimeout(syncTimer.current);
          void syncLists();
        } else {
          window.clearTimeout(syncTimer.current);
          syncTimer.current = window.setTimeout(() => void syncLists(), 1500);
        }
        setRemote((r) => ({
          seq: r.seq + 1,
          kind: "event",
          listId: event.list_id,
          version: event.version,
        }));
      },
    });
    const stopListening = onActivated(catchUp);
    return () => {
      close();
      stopListening();
      window.clearTimeout(syncTimer.current);
    };
  }, [token, syncLists]);

  /** Runs a request that removes a List from this user, so its disappearance is not announced. */
  const ownRemoval = async (id: number, run: () => Promise<void>) => {
    ownRemovals.current.add(id);
    try {
      await run();
    } catch (error) {
      ownRemovals.current.delete(id);
      throw error;
    }
  };

  const changeLanguage = useCallback(async (token: string, next: Language | null) => {
    const user = await updateLanguage(token, next);
    // An auto-created List name is rendered in the user's language, so refetch the Lists.
    // The choice is saved by now: apply it even if the refetch below fails.
    setLanguage(user.language);
    setState((s) => (s.kind === "ready" ? { ...s, user } : s));
    try {
      const lists = await fetchLists(token);
      setState((s) => (s.kind === "ready" ? { ...s, lists } : s));
    } catch {
      // Keep the stale List name; it refreshes on the next load.
    }
  }, []);

  const strings = t(language);
  switch (state.kind) {
    case "loading":
      return <Message title={strings.loading} />;
    case "not-telegram":
      return <Message title={strings.notTelegramTitle} hint={strings.notTelegramHint} />;
    case "error":
      return (
        <Message
          title={strings.errorTitle}
          hint={strings.errorHint}
          action={{ label: strings.retry, onClick: () => void boot() }}
        />
      );
    case "bad-link": {
      const { token, user, lists } = state;
      return (
        <Message
          title={strings.badLinkTitle}
          hint={strings.badLinkHint}
          action={
            lists.length > 0
              ? {
                  label: strings.openMyLists,
                  onClick: () =>
                    setState({
                      kind: "ready",
                      token,
                      user,
                      lists,
                      currentId: lists[0].id,
                      screen: "list",
                    }),
                }
              : undefined
          }
        />
      );
    }
    case "ready": {
      const current = state.lists.find((l) => l.id === state.currentId) ?? null;
      if (current && state.screen === "members") {
        return (
          <MembersScreen user={state.user} list={current} strings={strings} onBack={backToList} />
        );
      }
      if (current && state.screen === "history") {
        return (
          <HistoryScreen
            token={state.token}
            listId={current.id}
            language={language}
            strings={strings}
            onBack={backToList}
          />
        );
      }
      if (state.screen === "settings") {
        return (
          <SettingsScreen
            language={language}
            overridden={state.user.language_overridden}
            strings={strings}
            onBack={backToList}
            onChangeLanguage={(next) => changeLanguage(state.token, next)}
          />
        );
      }
      return (
        <>
          {notice !== null && (
            <p className="toast toast--top" role="status">
              {notice}
            </p>
          )}
          <ListScreen
            key={current?.id ?? "none"}
            remote={remote}
            token={state.token}
            lists={state.lists}
            list={current}
            language={language}
            strings={strings}
            failed={failed}
            onSelect={(id) => setState({ ...state, currentId: id })}
            onOpenMembers={() => setState({ ...state, screen: "members" })}
            onOpenSettings={() => setState({ ...state, screen: "settings" })}
            onOpenHistory={() => setState({ ...state, screen: "history" })}
            onCreate={(name) => mutate(async (token) => (await createList(token, name)).id)}
            onRename={(id, name) =>
              mutate(async (token) => {
                await renameList(token, id, name);
                return id;
              })
            }
            onLeave={(id) =>
              mutate(async (token) => {
                await ownRemoval(id, () => leaveList(token, id));
                return null;
              })
            }
            onDelete={(id) =>
              mutate(async (token) => {
                await ownRemoval(id, () => deleteList(token, id));
                return null;
              })
            }
          />
        </>
      );
    }
  }
}
