import { useCallback, useEffect, useRef, useState } from "react";
import type { Category, Entry } from "../api";
import type { Language, Strings } from "../i18n";
import { Sheet } from "../screens/Sheet";

interface Props {
  entry: Entry;
  categories: Category[];
  /** Name of the Entry's current Category; shown while the Category list is unavailable. */
  categoryName: string;
  language: Language;
  strings: Strings;
  /** Saves the Note; rejects on failure. Called one at a time, in order. */
  onSaveNote: (note: string) => Promise<void>;
  onChangeCategory: (category: string) => Promise<void>;
  onDelete: () => void;
  /** A Note save failed after the sheet had already closed. */
  onSaveFailed: () => void;
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
  categoryName,
  language,
  strings,
  onSaveNote,
  onChangeCategory,
  onDelete,
  onSaveFailed,
  onClose,
}: Props) {
  const [note, setNote] = useState(entry.note ?? "");
  const [category, setCategory] = useState(entry.category);
  const [failed, setFailed] = useState(false);
  const saved = useRef(entry.note ?? "");
  const latest = useRef(note);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
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
        if (mounted.current) setFailed(false);
      } catch (e) {
        console.error(e);
        if (mounted.current) setFailed(true);
        else onSaveFailed();
      }
    });
    return chain.current;
  }, [onSaveNote, onSaveFailed]);

  const close = useCallback(() => {
    void flush();
    onClose();
  }, [flush, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Unmounting (also when the List is switched under an open sheet) must not drop a Note still
  // waiting for its debounce: flush it, the save then reports through onSaveFailed.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void flush();
    };
  }, [flush]);

  // Save the pending Note first, so Undo brings back what was typed, not the old Note.
  const remove = async () => {
    await flush();
    onDelete();
  };

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
    <Sheet title={entry.name} closeLabel={strings.close} onClose={close}>
      <label className="field">
        <span className="field__label">{strings.entryNote}</span>
        <textarea
          className="entry-card__note"
          rows={2}
          maxLength={500}
          value={note}
          placeholder={strings.entryNotePlaceholder}
          onChange={(e) => onNoteChange(e.target.value)}
          onBlur={() => void flush()}
        />
      </label>

      <label className="field">
        <span className="field__label">{strings.entryCategory}</span>
        <select
          className="field__input"
          value={category}
          disabled={categories.length === 0}
          onChange={(e) => void pickCategory(e.target.value)}
        >
          {categories.length === 0 && <option value={category}>{categoryName}</option>}
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <p className="entry-card__meta">
        {entry.added_by_name ? `${strings.entryAddedBy} ${entry.added_by_name} · ` : ""}
        {when}
      </p>

      {failed && (
        <p className="entry-card__error" role="alert">
          {strings.entrySaveFailed}
        </p>
      )}

      <ul className="sheet-list">
        <li>
          <button type="button" className="sheet-row sheet-row--destructive" onClick={() => void remove()}>
            {strings.entryDelete}
          </button>
        </li>
      </ul>
    </Sheet>
  );
}
