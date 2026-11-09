import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  addEntries,
  deleteEntry,
  fetchCategories,
  fetchContents,
  restoreEntry,
  updateEntry,
  type Category,
  type ListContents,
  type ShoppingList,
} from "../api";
import { AvatarStack } from "../components/Avatar";
import { EntrySheet } from "../components/EntrySheet";
import { QUICK_ADD, type Language, type Strings } from "../i18n";
import { notifyHaptic } from "../telegram";

interface Props {
  token: string;
  list: ShoppingList | null;
  language: Language;
  strings: Strings;
  onOpenMembers: () => void;
  onOpenSettings: () => void;
}

const HIGHLIGHT_MS = 1600;
const UNDO_MS = 5000;

interface Removed {
  id: number;
  name: string;
}

/** The List screen: header with Members and Settings, the pinned input line, then Entries grouped by Category. */
export function ListScreen({ token, list, language, strings, onOpenMembers, onOpenSettings }: Props) {
  const [contents, setContents] = useState<ListContents | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<"add" | "load" | "delete" | "undo" | null>(null);
  const [text, setText] = useState("");
  const [pendingQuick, setPendingQuick] = useState<ReadonlySet<string>>(new Set());
  const input = useRef<HTMLTextAreaElement>(null);
  const listId = list?.id;
  const [openId, setOpenId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [removed, setRemoved] = useState<Removed[]>([]); // deleted Entries still undoable, oldest first

  // Responses can arrive out of order after quick consecutive adds: never replace newer contents.
  const showContents = useCallback((next: ListContents) => {
    setContents((prev) => (prev && prev.list.version > next.list.version ? prev : next));
  }, []);

  useEffect(() => {
    if (listId === undefined) return;
    fetchContents(token, listId).then(showContents, (e) => {
      console.error(e);
      setError("load");
    });
  }, [token, listId, showContents]);

  const refresh = useCallback(async () => {
    if (listId === undefined) return;
    try {
      showContents(await fetchContents(token, listId));
    } catch (e) {
      console.error(e);
      setError("load");
    }
  }, [token, listId, showContents]);

  const openSheet = (id: number) => {
    setOpenId(id);
    if (categories.length === 0) {
      fetchCategories(token).then(setCategories, (e) => console.error(e));
    }
  };

  const closeSheet = useCallback(() => setOpenId(null), []);

  const saveNote = useCallback(
    async (note: string) => {
      if (listId === undefined || openId === null) return;
      await updateEntry(token, listId, openId, { note: note.trim() ? note : null });
      await refresh();
    },
    [token, listId, openId, refresh],
  );

  const changeCategory = useCallback(
    async (category: string) => {
      if (listId === undefined || openId === null) return;
      await updateEntry(token, listId, openId, { category });
      await refresh();
    },
    [token, listId, openId, refresh],
  );

  const removeEntry = async (id: number, name: string) => {
    if (listId === undefined) return;
    setOpenId(null);
    try {
      await deleteEntry(token, listId, id);
    } catch (e) {
      console.error(e);
      setError("delete");
      return;
    }
    notifyHaptic("warning");
    setError(null);
    setRemoved((prev) => [...prev, { id, name }]);
    window.setTimeout(() => setRemoved((prev) => prev.filter((r) => r.id !== id)), UNDO_MS);
    await refresh();
  };

  const undoRemove = async () => {
    const last = removed[removed.length - 1];
    if (!last || listId === undefined) return;
    setRemoved((prev) => prev.filter((r) => r.id !== last.id));
    try {
      await restoreEntry(token, listId, last.id);
    } catch (e) {
      console.error(e);
      setError("undo");
      return;
    }
    notifyHaptic("success");
    await refresh();
  };

  // Grow the textarea with its content (field-sizing is not available in older iOS WebKit).
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const submit = useCallback(
    async (raw: string) => {
      if (listId === undefined || !raw.trim()) return;
      setError(null);
      let ids: number[];
      try {
        const result = await addEntries(token, listId, raw, crypto.randomUUID());
        ids = result.entries.map((e) => e.id);
      } catch (e) {
        console.error(e);
        setText((current) => current || raw); // give the text back, nothing is lost
        setError("add");
        return;
      }
      // The add succeeded: a failed refresh must not hand the text back (a retry would duplicate).
      try {
        showContents(await fetchContents(token, listId));
      } catch (e) {
        console.error(e);
        setError("load");
        return;
      }
      setFresh((prev) => new Set([...prev, ...ids]));
      window.setTimeout(
        () =>
          setFresh((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          }),
        HIGHLIGHT_MS,
      );
    },
    [token, listId, showContents],
  );

  const send = () => {
    const raw = text;
    if (!raw.trim()) return;
    setText(""); // stays focused and empty, ready for the next item
    input.current?.focus();
    void submit(raw);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  if (!list) {
    return (
      <main className="screen">
        <section className="empty">
          <p className="empty__title">{strings.noList}</p>
          <button type="button" className="text-button" onClick={onOpenSettings}>
            {strings.settings}
          </button>
        </section>
      </main>
    );
  }

  const groups = contents?.categories ?? [];
  const openEntry_ =
    openId === null ? null : groups.flatMap((g) => g.entries).find((e) => e.id === openId) ?? null;
  return (
    <main className="screen">
      <header className="header">
        <h1 className="header__title">{list.name}</h1>
        <button
          type="button"
          className="avatars-button"
          aria-label={strings.members}
          onClick={onOpenMembers}
        >
          <AvatarStack members={list.members} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={strings.settings}
          onClick={onOpenSettings}
        >
          ⚙︎
        </button>
      </header>

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          ref={input}
          className="composer__input"
          rows={1}
          value={text}
          placeholder={strings.inputPlaceholder}
          aria-label={strings.inputLabel}
          enterKeyHint="send"
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </form>
      {error && (
        <p className="notice" role="alert">
          {
            {
              add: strings.addFailed,
              load: strings.loadFailed,
              delete: strings.entryDeleteFailed,
              undo: strings.undoFailed,
            }[error]
          }
        </p>
      )}

      {contents && groups.length === 0 && (
        <section className="empty" aria-live="polite">
          <span className="empty__emoji" aria-hidden="true">
            🛒
          </span>
          <p className="empty__title">{strings.emptyTitle}</p>
          <p className="empty__hint">{strings.emptyInputHint}</p>
          <p className="empty__hint">{strings.emptyHint}</p>
          <div className="quick">
            {QUICK_ADD[language].map((name) => (
              <button
                key={name}
                type="button"
                className="quick__button"
                disabled={pendingQuick.has(name)}
                onClick={() => {
                  setPendingQuick((prev) => new Set(prev).add(name));
                  void submit(name).finally(() =>
                    setPendingQuick((prev) => {
                      const next = new Set(prev);
                      next.delete(name);
                      return next;
                    }),
                  );
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.key} className="group">
          <h2 className="group__header">
            <span aria-hidden="true">{group.emoji}</span>
            <span className="group__name">{group.name}</span>
            <span className="group__count">{group.count}</span>
          </h2>
          <ul className="rows">
            {group.entries.map((entry) => (
              <li key={entry.id} className={fresh.has(entry.id) ? "row row--new" : "row"}>
                <button type="button" className="row__name" onClick={() => openSheet(entry.id)}>
                  {entry.name}
                </button>
                {entry.note && <span className="row__note">{entry.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {openEntry_ && (
        <EntrySheet
          key={openEntry_.id}
          entry={openEntry_}
          categories={categories}
          language={language}
          strings={strings}
          onSaveNote={saveNote}
          onChangeCategory={changeCategory}
          onDelete={() => void removeEntry(openEntry_.id, openEntry_.name)}
          onClose={closeSheet}
        />
      )}

      {removed.length > 0 && (
        <div className="snackbar" role="status">
          <span className="snackbar__text">
            {strings.entryDeleted}: {removed[removed.length - 1].name}
          </span>
          <button type="button" className="snackbar__action" onClick={() => void undoRemove()}>
            {strings.undo}
          </button>
        </div>
      )}
    </main>
  );
}
