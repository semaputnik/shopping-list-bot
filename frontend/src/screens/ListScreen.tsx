import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  addEntries,
  buy,
  deleteEntry,
  fetchCategories,
  fetchChanges,
  fetchContents,
  fetchSuggestions,
  hideProduct,
  restoreEntry,
  updateEntry,
  uncheckAll,
  undoPurchase,
  type Category,
  type ListContents,
  type ShoppingList,
  type Suggestion,
} from "../api";
import { AvatarStack } from "../components/Avatar";
import { EntrySheet } from "../components/EntrySheet";
import { applyEntryChange } from "../entryChange";
import { QUICK_ADD, withCount, type Language, type Strings } from "../i18n";
import type { Remote } from "../sync";
import { bindMainButton, confirmDestructive, haptic, setMainButtonText } from "../telegram";
import { NameSheet, Sheet } from "./Sheet";

interface Props {
  token: string;
  /** All the user's Lists, most recently changed first. */
  lists: ShoppingList[];
  list: ShoppingList | null;
  language: Language;
  strings: Strings;
  /** True when the last action failed on the server. */
  failed: boolean;
  /** Changes announced by other Members, and app activations (see sync.ts). */
  remote: Remote;
  onSelect: (id: number) => void;
  onOpenMembers: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  /** Mutations resolve true on success, false when the request failed. */
  onCreate: (name: string) => Promise<boolean>;
  onRename: (id: number, name: string) => Promise<boolean>;
  onLeave: (id: number) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
}

type Panel = null | "switcher" | "menu" | "create" | "rename";

const HIGHLIGHT_MS = 1600;
const SUGGEST_DELAY_MS = 120;
const UNDO_MS = 5000;

interface Removed {
  id: number;
  name: string;
}

/** Same folding as the backend: case and diacritics ignored. */
function fold(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** The Entry being typed: the text after the last `;` or line break. */
function currentSegment(text: string): { start: number; query: string } {
  const start = Math.max(text.lastIndexOf(";"), text.lastIndexOf("\n")) + 1;
  const segment = text.slice(start);
  // After a comma the Note is being typed, which has no suggestions.
  return { start, query: segment.includes(",") ? "" : segment.trim() };
}

/**
 * The List screen: header (switcher, Members, menu), the pinned input line, then Entries grouped
 * by Category. Rendered with `key={list.id}` so every List starts with its own state.
 */
export function ListScreen({
  token,
  lists,
  list,
  language,
  strings,
  failed,
  remote,
  onSelect,
  onOpenMembers,
  onOpenSettings,
  onOpenHistory,
  onCreate,
  onRename,
  onLeave,
  onDelete,
}: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  // The sheet the BackButton returns to; null closes the sheets altogether.
  const [parent, setParent] = useState<Panel>(null);
  const close = useCallback(() => {
    setParent(null);
    setPanel(null);
  }, []);
  const openPanel = (next: Panel, from: Panel = null) => {
    setParent(from);
    setPanel(next);
  };
  // Back from a nested sheet returns to its parent (and forgets it); otherwise closes all.
  const back = useCallback(() => {
    setParent(null);
    setPanel(parent);
  }, [parent]);

  const [contents, setContents] = useState<ListContents | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<
    "add" | "load" | "check" | "delete" | "undo" | "save" | "buy" | "undoBuy" | null
  >(null);
  // The Purchase that can still be undone (the snackbar is up for UNDO_MS).
  const [undoable, setUndoable] = useState<{ id: number; listId: number; count: number } | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  const buying = useRef(false);
  const [text, setText] = useState("");
  const [pendingQuick, setPendingQuick] = useState<ReadonlySet<string>>(new Set());
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1); // index into the options; -1 = none highlighted
  const [dismissed, setDismissed] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const listId = list?.id;
  const [openId, setOpenId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [removed, setRemoved] = useState<Removed[]>([]); // deleted Entries still undoable, oldest first
  const { start: segmentStart, query } = currentSegment(text);
  const isNew = query !== "" && !suggestions.some((s) => fold(s.name) === fold(query));
  // Options in order: matching Products, then «Добавить «…»» for a new name.
  const optionCount = suggestions.length + (isNew ? 1 : 0);
  const open = query !== "" && !dismissed && optionCount > 0;

  useEffect(() => {
    setDismissed(false);
    setActive(-1);
    if (listId === undefined || query === "") {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchSuggestions(token, listId, query).then(
        (found) => {
          if (!cancelled) setSuggestions(found);
        },
        (e) => console.error(e), // suggestions are optional: typing and adding still work
      );
    }, SUGGEST_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, listId, query]);

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

  const contentsRef = useRef(contents);
  contentsRef.current = contents;

  /** Marks Entries with the soft "new or changed" highlight for a moment. */
  const flash = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
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
  }, []);

  /** Shows contents that came from someone else's change, highlighting what differs. */
  const showRemote = useCallback(
    (next: ListContents) => {
      const before = contentsRef.current;
      if (before && before.list.version >= next.list.version) return; // already up to date
      const known = new Map(before?.categories.flatMap((g) => g.entries).map((e) => [e.id, e]));
      const changed = next.categories
        .flatMap((g) => g.entries)
        .filter((e) => {
          const old = known.get(e.id);
          return (
            before !== null &&
            (!old ||
              old.checked !== e.checked ||
              old.note !== e.note ||
              old.name !== e.name ||
              old.category !== e.category)
          );
        })
        .map((e) => e.id);
      showContents(next);
      flash(changed);
    },
    [showContents, flash],
  );

  // Other Members' changes arrive as events; coming back to the app or a reconnected stream
  // asks the server what was missed (`changes?since=`), which answers with a snapshot when the
  // gap is too big. Our own changes echo back as events at a version already shown: ignored.
  const handled = useRef(remote.seq);
  useEffect(() => {
    if (remote.seq === handled.current || listId === undefined) return;
    handled.current = remote.seq;
    const have = contentsRef.current;
    const pull = () =>
      fetchContents(token, listId).then(showRemote, (e) => console.error(e));
    if (remote.kind === "event") {
      if (remote.listId !== listId) return;
      if (have && remote.version <= have.list.version) return;
      void pull();
      return;
    }
    if (!have) return; // the first load is still running and will bring the latest anyway
    fetchChanges(token, listId, have.list.version).then((result) => {
      if (result.snapshot) showRemote(result.snapshot);
      else if (result.changes.length > 0) void pull();
    }, (e) => console.error(e));
  }, [remote, token, listId, showRemote]);

  const refresh = useCallback(async () => {
    if (listId === undefined) return;
    try {
      showContents(await fetchContents(token, listId));
    } catch (e) {
      console.error(e);
      setError("load");
    }
  }, [token, listId, showContents]);

  const loadCategories = useCallback(() => {
    fetchCategories(token).then(setCategories, (e) => console.error(e));
  }, [token]);

  // Fetched up front so the card's select is ready; retried on open if that failed.
  useEffect(loadCategories, [loadCategories]);

  const openCard = (id: number) => {
    setOpenId(id);
    if (categories.length === 0) loadCategories();
  };

  const closeCard = useCallback(() => setOpenId(null), []);

  /** Sends one edit and applies the answer locally; a refetch only when it cannot be applied. */
  const editEntry = useCallback(
    async (entryId: number, change: { note?: string | null; category?: string }) => {
      if (listId === undefined) return;
      const result = await updateEntry(token, listId, entryId, change);
      let applied = false;
      setContents((prev) => {
        const next = prev && applyEntryChange(prev, result.entry, result.version, categories);
        applied = next !== null;
        return next ?? prev;
      });
      if (!applied) await refresh();
    },
    [token, listId, categories, refresh],
  );

  const saveNote = useCallback(
    (note: string) => {
      if (openId === null) return Promise.resolve();
      return editEntry(openId, { note: note.trim() ? note : null });
    },
    [openId, editEntry],
  );

  const changeCategory = useCallback(
    (category: string) => {
      if (openId === null) return Promise.resolve();
      return editEntry(openId, { category });
    },
    [openId, editEntry],
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
    haptic.error();
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
    haptic.success();
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
      flash(ids);
    },
    [token, listId, showContents, flash],
  );

  /** Applies a Checked state to the local copy right away; the Entry never moves. */
  const applyChecked = useCallback((match: (id: number) => boolean, checked: boolean) => {
    setContents((prev) =>
      prev && {
        ...prev,
        categories: prev.categories.map((g) => ({
          ...g,
          entries: g.entries.map((e) => (match(e.id) ? { ...e, checked } : e)),
        })),
      },
    );
  }, []);

  const reload = useCallback(
    (failure: "check" | "load" | "buy" | "undoBuy") => {
      if (listId === undefined) return;
      setError(failure);
      fetchContents(token, listId).then(showContents, console.error);
    },
    [token, listId, showContents],
  );

  const toggle = useCallback(
    (id: number, checked: boolean) => {
      if (listId === undefined) return;
      haptic.select();
      setError(null);
      applyChecked((x) => x === id, checked);
      updateEntry(token, listId, id, { checked }).then(
        (result) => setContents((prev) => prev && { ...prev, list: { ...prev.list, version: Math.max(prev.list.version, result.version) } }),
        (e) => {
          console.error(e);
          reload("check");
        },
      );
    },
    [token, listId, applyChecked, reload],
  );

  const checkedCount = (contents?.categories ?? []).reduce(
    (n, g) => n + g.entries.filter((e) => e.checked).length,
    0,
  );
  const anyChecked = checkedCount > 0;

  const dismissUndo = useCallback(() => {
    window.clearTimeout(undoTimer.current);
    setUndoable(null);
  }, []);
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);
  // The snackbar belongs to the List it was shown for.
  useEffect(() => {
    if (undoable && undoable.listId !== listId) dismissUndo();
  }, [undoable, listId, dismissUndo]);

  /** «Куплено»: Checked Entries leave as one Purchase; the snackbar offers Undo for 5 s. */
  const onBuy = useCallback(async () => {
    if (listId === undefined || buying.current) return;
    buying.current = true;
    haptic.success();
    setError(null);
    try {
      const result = await buy(token, listId);
      showContents(await fetchContents(token, listId));
      window.clearTimeout(undoTimer.current);
      setUndoable({ id: result.id, listId, count: result.count });
      undoTimer.current = window.setTimeout(() => setUndoable(null), UNDO_MS);
    } catch (e) {
      console.error(e);
      reload("buy");
    } finally {
      buying.current = false;
    }
  }, [token, listId, showContents, reload]);

  const onUndo = async () => {
    if (listId === undefined || !undoable || undoable.listId !== listId) return;
    const { id } = undoable;
    dismissUndo();
    haptic.select();
    try {
      await undoPurchase(token, listId, id);
      showContents(await fetchContents(token, listId));
    } catch (e) {
      console.error(e);
      reload("undoBuy");
    }
  };

  // The native «Куплено (N)» button exists only while something is Checked and no sheet covers
  // the screen. Bound once per visibility change; the label is updated in place.
  const boughtLabel = `${strings.bought} (${checkedCount})`;
  const label = useRef(boughtLabel);
  label.current = boughtLabel;
  const buttonVisible = checkedCount > 0 && panel === null;
  useEffect(() => {
    if (!buttonVisible) return;
    return bindMainButton(label.current, () => void onBuy());
  }, [buttonVisible, onBuy]);
  useEffect(() => {
    if (buttonVisible) setMainButtonText(boughtLabel);
  }, [buttonVisible, boughtLabel]);

  const onUncheckAll = () => {
    close();
    if (listId === undefined) return;
    haptic.select();
    setError(null);
    applyChecked(() => true, false);
    uncheckAll(token, listId).then(
      (result) => setContents((prev) => prev && { ...prev, list: { ...prev.list, version: Math.max(prev.list.version, result.version) } }),
      (e) => {
        console.error(e);
        reload("check");
      },
    );
  };

  const send = () => {
    const raw = text;
    if (!raw.trim()) return;
    setText(""); // stays focused and empty, ready for the next item
    input.current?.focus();
    void submit(raw);
  };

  /** Adds the typed text with the Entry being typed replaced by the chosen Product's name. */
  const choose = (index: number) => {
    const suggestion = suggestions[index]; // undefined for «Добавить «…»»: the text goes as typed
    const raw = suggestion ? text.slice(0, segmentStart) + suggestion.name : text;
    setText("");
    input.current?.focus();
    void submit(raw);
  };

  const forget = async (suggestion: Suggestion) => {
    if (listId === undefined) return;
    try {
      await hideProduct(token, listId, suggestion.product_id);
      setSuggestions((prev) => prev.filter((s) => s.product_id !== suggestion.product_id));
      setActive(-1);
    } catch (e) {
      console.error(e);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      // Cycles through -1 (nothing highlighted, Enter adds the text as typed) and every option.
      const slots = optionCount + 1;
      const step = event.key === "ArrowDown" ? 1 : slots - 1;
      setActive((i) => ((i + 1 + step) % slots) - 1);
      return;
    }
    if (open && event.key === "Escape") {
      event.preventDefault();
      setDismissed(true);
      return;
    }
    if (open && active >= 0 && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      choose(active);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const leave = async () => {
    if (!list) return;
    close();
    const ok = await confirmDestructive({
      title: strings.leaveTitle,
      message: list.members.length <= 1 ? strings.leaveLastMessage : strings.leaveMessage,
      confirmLabel: strings.leaveList,
    });
    if (ok) await onLeave(list.id);
  };

  const remove = async () => {
    if (!list) return;
    close();
    const ok = await confirmDestructive({
      title: strings.deleteTitle,
      message: withCount(strings.deleteMessage, list.members.length),
      confirmLabel: strings.deleteList,
    });
    if (ok) await onDelete(list.id);
  };

  const sheets = (
    <>
      {failed && (
        <p className="toast" role="alert">
          {strings.actionFailed}
        </p>
      )}
      {panel === "switcher" && (
        <Sheet title={strings.switchList} onClose={close} closeLabel={strings.cancel}>
          <ul className="sheet-list">
            {lists.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="sheet-row"
                  aria-current={l.id === list?.id}
                  onClick={() => {
                    if (l.id !== list?.id) haptic.select();
                    onSelect(l.id);
                    close();
                  }}
                >
                  <span className="sheet-row__name">{l.name}</span>
                  <span className="sheet-row__meta">
                    {l.id === list?.id ? "✓" : withCount(strings.membersCount, l.members.length)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <ul className="sheet-list">
            <li>
              <button type="button" className="sheet-row sheet-row--accent" onClick={() => openPanel("create", "switcher")}>
                {strings.newList}
              </button>
            </li>
          </ul>
        </Sheet>
      )}
      {panel === "menu" && list && (
        <Sheet title={strings.listMenu} onClose={close} closeLabel={strings.cancel}>
          <ul className="sheet-list">
            <li>
              <button type="button" className="sheet-row" onClick={() => openPanel("rename", "menu")}>
                {strings.renameList}
              </button>
            </li>
            <li>
              <button
                type="button"
                className="sheet-row"
                onClick={() => {
                  close();
                  onOpenHistory();
                }}
              >
                {strings.history}
              </button>
            </li>
            <li>
              <button type="button" className="sheet-row" disabled={!anyChecked} onClick={onUncheckAll}>
                {strings.uncheckAll}
              </button>
            </li>
            <li>
              <button
                type="button"
                className="sheet-row"
                onClick={() => {
                  close();
                  onOpenSettings();
                }}
              >
                {strings.settings}
              </button>
            </li>
            <li>
              <button type="button" className="sheet-row sheet-row--destructive" onClick={() => void leave()}>
                {strings.leaveList}
              </button>
            </li>
            <li>
              <button type="button" className="sheet-row sheet-row--destructive" onClick={() => void remove()}>
                {strings.deleteList}
              </button>
            </li>
          </ul>
        </Sheet>
      )}
      {panel === "create" && (
        <NameSheet
          title={strings.newList}
          label={strings.listName}
          placeholder={strings.listNamePlaceholder}
          submitLabel={strings.createList}
          cancelLabel={strings.cancel}
          initial=""
          onClose={back}
          onDone={close}
          onSubmit={onCreate}
        />
      )}
      {panel === "rename" && list && (
        <NameSheet
          title={strings.renameList}
          label={strings.listName}
          placeholder={strings.listNamePlaceholder}
          submitLabel={strings.save}
          cancelLabel={strings.cancel}
          initial={list.name}
          onClose={back}
          onDone={close}
          onSubmit={(name) => onRename(list.id, name)}
        />
      )}
    </>
  );

  if (!list) {
    return (
      <main className="screen">
        <section className="empty">
          <p className="empty__title">{strings.noList}</p>
          <button type="button" className="empty__action" onClick={() => openPanel("create")}>
            {strings.newList}
          </button>
          <button type="button" className="text-button" onClick={onOpenSettings}>
            {strings.settings}
          </button>
        </section>
        {sheets}
      </main>
    );
  }

  const groups = contents?.categories ?? [];
  const openEntry =
    openId === null ? null : (groups.flatMap((g) => g.entries).find((e) => e.id === openId) ?? null);
  return (
    <main className="screen">
      <header className="header">
        <h1 className="header__heading">
          <button
            type="button"
            className="header__switch"
            aria-haspopup="dialog"
            onClick={() => openPanel("switcher")}
          >
            <span className="header__title">{list.name}</span>
            <span className="header__chevron" aria-hidden="true">
              ▾
            </span>
          </button>
        </h1>
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
          className="header__menu"
          aria-label={strings.listMenu}
          onClick={() => openPanel("menu")}
        >
          ⋯
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
          role="combobox"
          aria-expanded={open}
          aria-controls="suggestions"
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `suggestion-${active}` : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {open && (
          <ul id="suggestions" className="suggest" role="listbox" aria-label={strings.suggestions}>
            {suggestions.map((s, i) => (
              <li key={s.product_id} className="suggest__item" role="presentation">
                <button
                  type="button"
                  id={`suggestion-${i}`}
                  role="option"
                  aria-selected={active === i}
                  className={active === i ? "suggest__option suggest__option--active" : "suggest__option"}
                  onMouseDown={(e) => e.preventDefault()} // keep the input focused
                  onClick={() => choose(i)}
                >
                  <span className="suggest__name">{s.name}</span>
                  {s.on_list && <span className="suggest__hint">{strings.alreadyOnList}</span>}
                </button>
                <button
                  type="button"
                  className="suggest__forget"
                  aria-label={`${strings.forgetProduct}: ${s.name}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void forget(s)}
                >
                  ✕
                </button>
              </li>
            ))}
            {isNew && (
              <li className="suggest__item" role="presentation">
                <button
                  type="button"
                  id={`suggestion-${suggestions.length}`}
                  role="option"
                  aria-selected={active === suggestions.length}
                  className={
                    active === suggestions.length
                      ? "suggest__option suggest__option--active"
                      : "suggest__option"
                  }
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(suggestions.length)}
                >
                  <span className="suggest__name">
                    {strings.addNew} «{query}»
                  </span>
                </button>
              </li>
            )}
          </ul>
        )}
      </form>
      {error && (
        <p className="notice" role="alert">
          {
            {
              add: strings.addFailed,
              load: strings.loadFailed,
              check: strings.checkFailed,
              delete: strings.entryDeleteFailed,
              undo: strings.undoFailed,
              save: strings.entrySaveFailed,
              buy: strings.buyFailed,
              undoBuy: strings.undoBuyFailed,
            }[error]
          }
        </p>
      )}
      {undoable && removed.length === 0 && (
        <div className="snackbar" role="status">
          <span className="snackbar__text">{`${strings.bought}: ${undoable.count}`}</span>
          <button type="button" className="snackbar__action" onClick={() => void onUndo()}>
            {strings.undo}
          </button>
        </div>
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
              <li
                key={entry.id}
                className={["row", entry.checked && "row--checked", fresh.has(entry.id) && "row--new"]
                  .filter(Boolean)
                  .join(" ")}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={entry.checked}
                  aria-label={entry.name}
                  className="row__toggle"
                  onClick={() => toggle(entry.id, !entry.checked)}
                >
                  <span className="row__check" aria-hidden="true" />
                </button>
                <button type="button" className="row__open" onClick={() => openCard(entry.id)}>
                  <span className="row__name">{entry.name}</span>
                  {entry.note && <span className="row__note">{entry.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {openEntry && (
        <EntrySheet
          key={openEntry.id}
          entry={openEntry}
          categories={categories}
          categoryName={groups.find((g) => g.key === openEntry.category)?.name ?? ""}
          language={language}
          strings={strings}
          onSaveNote={saveNote}
          onChangeCategory={changeCategory}
          onDelete={() => void removeEntry(openEntry.id, openEntry.name)}
          onSaveFailed={() => setError("save")}
          onClose={closeCard}
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
      {sheets}
    </main>
  );
}
