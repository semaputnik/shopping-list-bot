import { useCallback, useEffect, useState } from "react";
import { authenticate, fetchLists, updateLanguage, type ShoppingList, type User } from "./api";
import { pickLanguage, t, type Language } from "./i18n";
import { ListScreen } from "./screens/ListScreen";
import { Message } from "./screens/Message";
import { SettingsScreen } from "./screens/SettingsScreen";
import { startTelegram } from "./telegram";

type State =
  | { kind: "loading" }
  | { kind: "not-telegram" }
  | { kind: "error" }
  | {
      kind: "ready";
      token: string;
      user: User;
      lists: ShoppingList[];
      screen: "list" | "settings";
    };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
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
      const lists = await fetchLists(session.token);
      setLanguage(session.user.language);
      setState({
        kind: "ready",
        token: session.token,
        user: session.user,
        lists,
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

  const changeLanguage = useCallback(async (token: string, next: Language | null) => {
    const user = await updateLanguage(token, next);
    // An auto-created List name is rendered in the user's language, so refetch the Lists.
    const lists = await fetchLists(token);
    setLanguage(user.language);
    setState((s) => (s.kind === "ready" ? { ...s, user, lists } : s));
  }, []);

  // Stable identity: the Settings screen binds Telegram's BackButton to it.
  const closeSettings = useCallback(
    () => setState((s) => (s.kind === "ready" ? { ...s, screen: "list" } : s)),
    [],
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
    case "ready":
      if (state.screen === "settings") {
        return (
          <SettingsScreen
            language={language}
            overridden={state.user.language_overridden}
            strings={strings}
            onBack={closeSettings}
            onChangeLanguage={(next) => changeLanguage(state.token, next)}
          />
        );
      }
      return (
        <ListScreen
          user={state.user}
          list={state.lists[0] ?? null}
          strings={strings}
          onOpenSettings={() => setState({ ...state, screen: "settings" })}
        />
      );
  }
}
