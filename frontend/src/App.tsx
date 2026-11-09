import { useCallback, useEffect, useState } from "react";
import {
  authenticate,
  createList,
  deleteList,
  fetchLists,
  leaveList,
  renameList,
  type ShoppingList,
  type User,
} from "./api";
import { pickLanguage, t, type Language } from "./i18n";
import { ListScreen } from "./screens/ListScreen";
import { Message } from "./screens/Message";
import { haptic, startTelegram } from "./telegram";

type State =
  | { kind: "loading" }
  | { kind: "not-telegram" }
  | { kind: "error" }
  | { kind: "ready"; token: string; user: User; lists: ShoppingList[]; currentId: number | null };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
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
      const lists = await fetchLists(session.token);
      setLanguage(session.user.language);
      setState({
        kind: "ready",
        token: session.token,
        user: session.user,
        lists,
        currentId: lists[0]?.id ?? null,
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
    case "ready": {
      const current = state.lists.find((l) => l.id === state.currentId) ?? null;
      return (
        <ListScreen
          user={state.user}
          lists={state.lists}
          list={current}
          strings={strings}
          failed={failed}
          onSelect={(id) => setState({ ...state, currentId: id })}
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
