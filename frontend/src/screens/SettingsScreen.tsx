import { useEffect, useState } from "react";
import { LANGUAGE_NAMES, type Language, type Strings } from "../i18n";
import { showNativeBackButton } from "../telegram";

interface Props {
  language: Language;
  /** True when the user chose a language; false while following Telegram's. */
  overridden: boolean;
  strings: Strings;
  onBack: () => void;
  /** null goes back to following Telegram's language. */
  onChangeLanguage: (language: Language | null) => Promise<void>;
}

const LANGUAGES: Language[] = ["ru", "es"];

/** Settings: for now the interface language choice (RU/ES, or as in Telegram). */
export function SettingsScreen({
  language,
  overridden,
  strings,
  onBack,
  onChangeLanguage,
}: Props) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Nested screens use Telegram's native BackButton.
  useEffect(() => showNativeBackButton(onBack), [onBack]);

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

  const option = (key: string, label: string, checked: boolean, next: Language | null) => (
    <li key={key}>
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        className="settings__option"
        disabled={busy}
        onClick={() => void choose(next)}
      >
        {label}
      </button>
    </li>
  );

  return (
    <main className="screen">
      <header className="header">
        <h1 className="header__title">{strings.settings}</h1>
      </header>
      <h2 className="settings__section-title">{strings.languageSection}</h2>
      <ul className="settings__group" role="radiogroup" aria-label={strings.languageSection}>
        {option("telegram", strings.languageAsTelegram, !overridden, null)}
        {LANGUAGES.map((code) =>
          option(code, LANGUAGE_NAMES[code], overridden && code === language, code),
        )}
      </ul>
      {failed && (
        <p className="settings__error" role="alert">
          {strings.languageSaveError}
        </p>
      )}
    </main>
  );
}
