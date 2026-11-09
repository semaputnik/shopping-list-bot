import { useCallback, useEffect, useRef, useState } from "react";
import type { Category, Entry } from "../api";
import type { Language, Strings } from "../i18n";
import { showNativeBackButton } from "../telegram";

interface Props {
  entry: Entry;
  categories: Category[];
  language: Language;
  strings: Strings;
  /** Saves the Note; rejects on failure. Called one at a time, in order. */
  onSaveNote: (note: string) => Promise<void>;
  onChangeCategory: (category: string) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}

const AUTOSAVE_MS = 600;

/** The backend may send a UTC time without a zone suffix; treat it as UTC. */
function parseTime(value: string): Date {
  return new Date(/(Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
}

/** Bottom sheet for one Entry: Note (autosaved), Category, who added it, Delete. */
export function EntrySheet({
  entry,
  categories,
  language,
  strings,
  onSaveNote,
  onChangeCategory,
  onDelete,
  onClose,
}: Props) {
  const [note, setNote] = useState(entry.note ?? "");
  const [category, setCategory] = useState(entry.category);
  const [failed, setFailed] = useState(false);
  const saved = useRef(entry.note ?? "");
  const latest = useRef(note);
  const timer = useRef<number | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());

  // Saves run one after another so an older request can never land after a newer one.
  const flush = useCallback((): Promise<void> => {
    window.clearTimeout(timer.current);
    chain.current = chain.current.then(async () => {
      const value = latest.current;
      if (value === saved.current) return;
      try {
        await onSaveNote(value);
        saved.current = value;
        setFailed(false);
      } catch (e) {
        console.error(e);
        setFailed(true);
      }
    });
    return chain.current;
  }, [onSaveNote]);

  const close = useCallback(() => {
    void flush();
    onClose();
  }, [flush, onClose]);

  useEffect(() => showNativeBackButton(close), [close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onNoteChange = (value: string) => {
    setNote(value);
    latest.current = value;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS);
  };

  const pickCategory = async (key: string) => {
    const previous = category;
    setCategory(key);
    try {
      await onChangeCategory(key);
      setFailed(false);
    } catch (e) {
      console.error(e);
      setCategory(previous);
      setFailed(true);
    }
  };

  const when = parseTime(entry.created_at).toLocaleString(language, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="sheet-root">
      <div className="sheet-scrim" onClick={close} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={entry.name}>
        <div className="sheet__grip" aria-hidden="true" />
        <div className="sheet__head">
          <h2 className="sheet__title">{entry.name}</h2>
          <button type="button" className="icon-button" aria-label={strings.close} onClick={close}>
            ✕
          </button>
        </div>

        <label className="sheet__field">
          <span className="sheet__label">{strings.entryNote}</span>
          <textarea
            className="sheet__input"
            rows={2}
            maxLength={500}
            value={note}
            placeholder={strings.entryNotePlaceholder}
            onChange={(e) => onNoteChange(e.target.value)}
            onBlur={() => void flush()}
          />
        </label>

        <label className="sheet__field">
          <span className="sheet__label">{strings.entryCategory}</span>
          <select
            className="sheet__input"
            value={category}
            onChange={(e) => void pickCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <p className="sheet__meta">
          {strings.entryAddedBy}
          {entry.added_by_name ? ` ${entry.added_by_name}` : ""} · {when}
        </p>

        {failed && (
          <p className="settings__error" role="alert">
            {strings.entrySaveFailed}
          </p>
        )}

        <button type="button" className="sheet__delete" onClick={onDelete}>
          {strings.entryDelete}
        </button>
      </div>
    </div>
  );
}
