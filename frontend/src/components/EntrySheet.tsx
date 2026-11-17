import { useCallback, useEffect, useRef, useState } from "react";
import { Chip, Input, List, Section, Select, Textarea } from "@telegram-apps/telegram-ui";
import { ApiError, type Category, type Entry } from "../api";
import type { Language, Strings } from "../i18n";
import { Sheet } from "../screens/Sheet";
import { ActionCell } from "./ActionCell";

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
  /** Renames the whole Product (every Entry of it in this List); rejects on failure. */
  onRename: (name: string) => Promise<void>;
  /** Gives the Product another name; rejects with ApiError 409 when another Product has it. */
  onAddAlias: (name: string) => Promise<void>;
  onRemoveAlias: (aliasId: number) => Promise<void>;
  onDelete: () => void;
  /** A Note or Alias save failed after the sheet had already closed. */
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
  onRename,
  onAddAlias,
  onRemoveAlias,
  onDelete,
  onSaveFailed,
  onClose,
}: Props) {
  const [note, setNote] = useState(entry.note ?? "");
  const [category, setCategory] = useState(entry.category);
  const [name, setName] = useState(entry.name);
  const renaming = useRef(false);
  const [alias, setAlias] = useState("");
  const [aliasTaken, setAliasTaken] = useState(false);
  const addingAlias = useRef(false);
  const droppingAlias = useRef(new Set<number>());
  // A removed Alias is gone from view, so ✕ arms the chip and a second tap removes it.
  const [armedAlias, setArmedAlias] = useState<number | null>(null);
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

  // Saved on blur or Enter (Enter blurs), so a typed Alias is never lost when the sheet closes.
  const commitAlias = useCallback(async () => {
    const value = alias.trim();
    if (!value || addingAlias.current) return;
    addingAlias.current = true;
    try {
      await onAddAlias(value);
      setAlias("");
      setAliasTaken(false);
      setFailed(false);
    } catch (e) {
      console.error(e);
      if (!mounted.current) onSaveFailed();
      else if (e instanceof ApiError && e.status === 409) setAliasTaken(true);
      else setFailed(true);
    } finally {
      addingAlias.current = false;
    }
  }, [alias, onAddAlias, onSaveFailed]);

  // Closing still sends a typed Alias; if that fails once the sheet is gone, it reports through onSaveFailed.
  const close = useCallback(() => {
    void flush();
    void commitAlias();
    onClose();
  }, [flush, onClose, commitAlias]);

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

  // The name is saved on blur or Enter, not while typing: a rename can merge two Products,
  // so a half-typed name must never reach the server.
  const commitName = async () => {
    const value = name.trim();
    if (!value) {
      setName(entry.name);
      return;
    }
    if (value === entry.name || renaming.current) return;
    renaming.current = true;
    try {
      await onRename(value);
      setFailed(false);
    } catch (e) {
      console.error(e);
      setName(entry.name);
      setFailed(true);
    } finally {
      renaming.current = false;
    }
  };

  const dropAlias = async (id: number) => {
    if (armedAlias !== id) {
      setArmedAlias(id);
      return;
    }
    if (droppingAlias.current.has(id)) return;
    droppingAlias.current.add(id);
    setArmedAlias(null);
    try {
      await onRemoveAlias(id);
      setFailed(false);
    } catch (e) {
      console.error(e);
      setFailed(true);
    } finally {
      droppingAlias.current.delete(id);
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
      <List>
        <Section footer={strings.entryNameHint}>
          <Input
            header={strings.entryName}
            type="text"
            maxLength={200}
            enterKeyHint="done"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        </Section>
        <Section header={strings.aliases} footer={aliasTaken ? strings.aliasTaken : strings.aliasesHint}>
          {entry.aliases.length > 0 && (
            <div className="aliases">
              {entry.aliases.map((a) => (
                <Chip
                  key={a.id}
                  mode="mono"
                  after={
                    <button
                      type="button"
                      className={armedAlias === a.id ? "aliases__remove aliases__remove--armed" : "aliases__remove"}
                      aria-label={`${strings.aliasRemove}: ${a.name}`}
                      onClick={() => void dropAlias(a.id)}
                      onBlur={() => setArmedAlias((id) => (id === a.id ? null : id))}
                    >
                      {armedAlias === a.id ? strings.forgetConfirm : "✕"}
                    </button>
                  }
                >
                  {a.name}
                </Chip>
              ))}
            </div>
          )}
          <Input
            type="text"
            maxLength={200}
            enterKeyHint="done"
            status={aliasTaken ? "error" : "default"}
            value={alias}
            placeholder={strings.aliasesPlaceholder}
            onChange={(e) => {
              setAlias(e.target.value);
              setAliasTaken(false);
            }}
            onBlur={() => void commitAlias()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        </Section>
        <Section>
          <Textarea
            header={strings.entryNote}
            rows={2}
            maxLength={500}
            value={note}
            placeholder={strings.entryNotePlaceholder}
            onChange={(e) => onNoteChange(e.target.value)}
            onBlur={() => void flush()}
          />
        </Section>
        <Section footer={`${entry.added_by_name ? `${strings.entryAddedBy} ${entry.added_by_name} · ` : ""}${when}`}>
          <Select
            header={strings.entryCategory}
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
          </Select>
        </Section>
        {failed && (
          <p className="sheet__error" role="alert">
            {strings.entrySaveFailed}
          </p>
        )}
        <Section>
          <ActionCell
            tone="destructive"
            onClick={() => void remove()}
          >
            {strings.entryDelete}
          </ActionCell>
        </Section>
      </List>
    </Sheet>
  );
}
