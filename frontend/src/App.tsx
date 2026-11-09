import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  authenticate,
  fetchLists,
  joinList,
  type ShoppingList,
  type User,
} from "./api";
import { pickLanguage, t, type Language } from "./i18n";
import { ListScreen } from "./screens/ListScreen";
import { MembersScreen } from "./screens/MembersScreen";
import { Message } from "./screens/Message";
import { startTelegram } from "./telegram";

type State =
  | { kind: "loading" }
  | { kind: "not-telegram" }
  | { kind: "error" }
  | { kind: "bad-link"; token: string; user: User; lists: ShoppingList[] }
  | { kind: "ready"; token: string; user: User; lists: ShoppingList[]; currentId: number | null; screen: Screen };

type Screen = "list" | "members";

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const backToList = useCallback(
    () => setState((s) => (s.kind === "ready" ? { ...s, screen: "list" } : s)),
    [],
  );
  const [language, setLanguage] = useState<Language>(() =>
    pickLanguage(navigator.language),
  );

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
      const { user, lists, token } = state;
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
      const list = state.lists.find((l) => l.id === state.currentId) ?? null;
      if (list && state.screen === "members") {
        return (
          <MembersScreen
            user={state.user}
            list={list}
            strings={strings}
            onBack={backToList}
          />
        );
      }
      return (
        <ListScreen
          token={state.token}
          list={list}
          language={language}
          strings={strings}
          onOpenMembers={() => setState({ ...state, screen: "members" })}
        />
      );
    }
  }
}
