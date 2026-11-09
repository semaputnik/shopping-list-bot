import { useCallback, useEffect, useState } from "react";
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
import { haptic, startTelegram } from "./telegram";

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
        <ListScreen
          key={current?.id ?? "none"}
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
              await leaveList(token, id);
              return null;
            })
          }
          onDelete={(id) =>
            mutate(async (token) => {
              await deleteList(token, id);
              return null;
            })
          }
        />
      );
    }
  }
}
