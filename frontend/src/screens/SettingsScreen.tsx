import { useState } from "react";
import { LANGUAGE_NAMES, type Language, type Strings } from "../i18n";

interface Props {
  language: Language;
  strings: Strings;
  onBack: () => void;
  onChangeLanguage: (language: Language) => Promise<void>;
}

const LANGUAGES: Language[] = ["ru", "es"];

/** Settings: for now the interface language choice (RU/ES). */
export function SettingsScreen({ language, strings, onBack, onChangeLanguage }: Props) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const choose = async (next: Language) => {
    if (next === language || busy) return;
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

  return (
    <main className="screen">
      <header className="header">
        <button type="button" className="text-button" onClick={onBack}>
          ‹ {strings.back}
        </button>
        <h1 className="header__title">{strings.settings}</h1>
      </header>
      <h2 className="settings__section-title">{strings.languageSection}</h2>
      <ul className="settings__group" role="radiogroup" aria-label={strings.languageSection}>
        {LANGUAGES.map((code) => (
          <li key={code}>
            <button
              type="button"
              role="radio"
              aria-checked={code === language}
              className="settings__option"
              disabled={busy}
              onClick={() => void choose(code)}
            >
              {LANGUAGE_NAMES[code]}
            </button>
          </li>
        ))}
      </ul>
      {failed && (
        <p className="settings__error" role="alert">
          {strings.languageSaveError}
        </p>
      )}
    </main>
  );
}
