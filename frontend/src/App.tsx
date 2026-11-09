import { useCallback, useEffect, useState } from "react";
import { authenticate, fetchLists, type ShoppingList, type User } from "./api";
import { pickLanguage, t, type Language } from "./i18n";
import { ListScreen } from "./screens/ListScreen";
import { Message } from "./screens/Message";
import { startTelegram } from "./telegram";

type State =
  | { kind: "loading" }
  | { kind: "not-telegram" }
  | { kind: "error" }
  | { kind: "ready"; user: User; lists: ShoppingList[] };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [language, setLanguage] = useState<Language>(() =>
    pickLanguage(navigator.language),
  );

  const boot = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const telegram = await startTelegram();
      if (!telegram) {
        setState({ kind: "not-telegram" });
        return;
      }
      setLanguage(pickLanguage(telegram.languageCode));
      const session = await authenticate(telegram.rawInitData);
      const lists = await fetchLists(session.token);
      setLanguage(session.user.language);
      setState({ kind: "ready", user: session.user, lists });
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
    case "ready":
      return <ListScreen user={state.user} list={state.lists[0] ?? null} strings={strings} />;
  }
}
