import { useEffect, useState } from "react";
import { Cell, List, Radio, Section, Title } from "@telegram-apps/telegram-ui";
import { LANGUAGE_HINTS, LANGUAGE_NAMES, type Language, type Strings } from "../i18n";
import { bindBackButton } from "../telegram";

interface Props {
  language: Language;
  /** What Telegram's own language maps to; the first option names it. */
  telegramLanguage: Language;
  /** True when the user chose a language; false while following Telegram's. */
  overridden: boolean;
  strings: Strings;
  onBack: () => void;
  /** null goes back to following Telegram's language. */
  onChangeLanguage: (language: Language | null) => Promise<void>;
}

const LANGUAGES: Language[] = ["ru", "es", "en"];

/** Settings: for now the interface language choice (RU/ES/EN, or as in Telegram). */
export function SettingsScreen({
  language,
  telegramLanguage,
  overridden,
  strings,
  onBack,
  onChangeLanguage,
}: Props) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Nested screens use Telegram's native BackButton.
  useEffect(() => bindBackButton(onBack), [onBack]);

  const choose = async (next: Language | null) => {
    if (busy || (next === null ? !overridden : overridden && next === language)) return;
    setBusy(true);
    setFailed(false);
    try {
      await onChangeLanguage(next);
    } catch (error) {
      console.error(error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  // Every option is a two-line Cell: the choice, then what it does.
  const option = (key: string, label: string, hint: string, checked: boolean, next: Language | null) => (
    <Cell
      key={key}
      Component="label"
      before={
        <Radio
          name="language"
          checked={checked}
          disabled={busy}
          onChange={() => void choose(next)}
        />
      }
      description={hint}
      multiline
    >
      {label}
    </Cell>
  );

  return (
    <main className="screen">
      <Title level="1" weight="1" className="screen__title">
        {strings.settings}
      </Title>
      <List className="plain-list">
        <Section header={strings.languageSection}>
          {option(
            "telegram",
            strings.languageAsTelegram,
            strings.languageAsTelegramHint.replace("{language}", LANGUAGE_NAMES[telegramLanguage]),
            !overridden,
            null,
          )}
          {LANGUAGES.map((code) =>
            option(code, LANGUAGE_NAMES[code], LANGUAGE_HINTS[code], overridden && code === language, code),
          )}
        </Section>
      </List>
      {failed && (
        <p className="screen__error" role="alert">
          {strings.languageSaveError}
        </p>
      )}
    </main>
  );
}
