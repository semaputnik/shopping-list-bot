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
import { AvatarStack, EntryAvatar } from "../components/Avatar";
import { EntrySheet } from "../components/EntrySheet";
import { applyEntryChange } from "../entryChange";
import { QUICK_ADD, withCount, type Language, type Strings } from "../i18n";
import { shareList } from "../share";
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
  const [removed, setRemoved] = useState<Removed[]>([]);
  // The trip just ended with «Куплено»: an emptied List says so instead of looking blank.
  const [justBought, setJustBought] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const infoTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(infoTimer.current), []); // deleted Entries still undoable, oldest first
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
          if (cancelled) return;
          setSuggestions(found);
          // Enter takes the first suggestion when it starts with what was typed (spec §4);
          // a fuzzy-only match stays unselected, so Enter adds the text as typed.
          setActive(found.length > 0 && fold(found[0].name).startsWith(fold(query)) ? 0 : -1);
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

  // Entries this user is editing right now: the echo of their own command is not news.
  // Deliberate: for these 3 s another Member's change to the same Entry is not highlighted
  // either (cosmetic; the data still updates).
  const ownEntries = useRef(new Set<number>());
  const markOwn = useCallback((id: number) => {
    ownEntries.current.add(id);
    window.setTimeout(() => ownEntries.current.delete(id), 3000);
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
            !ownEntries.current.has(e.id) &&
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

  /**
   * The version to record after our own command answered with `answered`. Only the very next
   * version is ours alone; anything further means other changes landed in between, so the local
   * version stays put and the latest contents are pulled (never skip a version we did not see).
   */
  const ownVersion = useCallback(
    (answered: number): number => {
      const current = contentsRef.current?.list.version ?? 0;
      if (answered <= current) return current;
      if (answered === current + 1) {
        if (contentsRef.current) {
          // Keep the ref honest until the next render, so two quick answers chain correctly.
          contentsRef.current = {
            ...contentsRef.current,
            list: { ...contentsRef.current.list, version: answered },
          };
        }
        return answered;
      }
      if (listId !== undefined) {
        fetchContents(token, listId).then(showRemote, (e) => console.error(e));
      }
      return current;
    },
    [token, listId, showRemote],
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
      markOwn(entryId);
      const result = await updateEntry(token, listId, entryId, change);
      const version = ownVersion(result.version);
      let applied = false;
      setContents((prev) => {
        const next = prev && applyEntryChange(prev, result.entry, version, categories);
        applied = next !== null;
        return next ?? prev;
      });
      if (!applied) await refresh();
    },
    [token, listId, categories, refresh, markOwn, ownVersion],
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
    // One snackbar at a time: the newest action owns it, so a pending Purchase Undo is dismissed
    // rather than left to expire unseen behind this one.
    window.clearTimeout(undoTimer.current);
    setUndoable(null);
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
      setJustBought(false);
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

  // Connectivity, shown as a persistent status; coming back online pulls what was missed.
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => {
      setOnline(true);
      void refresh();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [refresh]);

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
      markOwn(id);
      updateEntry(token, listId, id, { checked }).then(
        (result) => {
          const version = ownVersion(result.version);
          // The server may overrule us (check beats a near-simultaneous uncheck): its verdict wins.
          setContents((prev) => {
            if (!prev) return prev;
            // Always apply the answer: a remote snapshot shown while this command was in
            // flight may have wiped the optimistic state, and the own echo is ignored.
            const next = applyEntryChange(prev, result.entry, version, categories);
            return next ?? { ...prev, list: { ...prev.list, version } };
          });
        },
        (e) => {
          console.error(e);
          // Never show a check the server did not take: put it back, then pull the truth.
          applyChecked((x) => x === id, !checked);
          reload("check");
        },
      );
    },
    [token, listId, applyChecked, reload, categories, markOwn, ownVersion],
  );

  const checkedCount = (contents?.categories ?? []).reduce(
    (n, g) => n + g.entries.filter((e) => e.checked).length,
    0,
  );
  const anyChecked = checkedCount > 0;
  const totalCount = (contents?.categories ?? []).reduce((n, g) => n + g.entries.length, 0);
  const shared = (list?.members.length ?? 0) > 1;

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
      setRemoved([]); // the newest action owns the snackbar (see removeEntry)
      setUndoable({ id: result.id, listId, count: result.count });
      setJustBought(true);
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
      setJustBought(false);
      showContents(await fetchContents(token, listId));
    } catch (e) {
      console.error(e);
      reload("undoBuy");
    }
  };

  /** «Повторить» on the error toast: a failed add goes again (its text was handed back), the rest
   * re-read the List so what is shown is the server's truth. */
  const retry = async () => {
    const failed = error;
    setError(null);
    if (failed === "add" && text.trim()) {
      const again = text;
      setText("");
      await submit(again);
      return;
    }
    await refresh();
  };

  // The native «Куплено (N)» button exists only while something is Checked and no sheet (nor the
  // Entry card) covers the screen, so a stray tap while editing cannot commit a Purchase. Bound once per visibility change; the label is updated in place.
  const boughtLabel = `${strings.bought} (${checkedCount})`;
  const label = useRef(boughtLabel);
  label.current = boughtLabel;
  const buttonVisible = checkedCount > 0 && panel === null && openId === null;
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
      (result) => {
        const version = ownVersion(result.version);
        setContents((prev) => prev && { ...prev, list: { ...prev.list, version } });
        // Always show the server's truth: it may have spared Entries (another Member's fresh
        // check wins), and a remote snapshot shown meanwhile may have undone the optimistic state.
        void refresh();
      },
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

  // «Убрать из подсказок» has no undo on the server, so it takes two taps: ✕ arms, «Убрать» removes.
  const [armed, setArmed] = useState<number | null>(null);
  useEffect(() => setArmed(null), [query]);
  const forget = async (suggestion: Suggestion) => {
    if (listId === undefined) return;
    if (armed !== suggestion.product_id) {
      setArmed(suggestion.product_id);
      return;
    }
    setArmed(null);
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
    if (open && active >= 0) choose(active);
    else send();
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

  const onShare = async () => {
    close();
    if (!list) return;
    const result = await shareList(list.share_url, strings.shareText.replace("{name}", list.name));
    if (result === "unavailable") haptic.error();
    else haptic.success();
    if (result === "shared") return; // Telegram's own picker is the feedback
    setInfo(result === "copied" ? strings.linkCopied : strings.linkUnavailable);
    window.clearTimeout(infoTimer.current);
    infoTimer.current = window.setTimeout(() => setInfo(null), 2500);
  };

  const sheets = (
    <>
      {failed && (
        <p className="alert" role="alert">
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
              <button type="button" className="sheet-row sheet-row--accent" onClick={() => void onShare()}>
                {strings.shareList}
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
                  onOpenHistory();
                }}
              >
                {strings.history}
              </button>
            </li>
          </ul>
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
                  onOpenSettings();
                }}
              >
                {strings.settings}
              </button>
            </li>
          </ul>
          {/* Destructive actions live in their own group, away from routine ones. */}
          <ul className="sheet-list">
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

      {totalCount > 0 && (
        <p className="progress" aria-live="polite">
          {checkedCount === totalCount
            ? strings.allInBasket
            : strings.progress
                .replace("{left}", String(totalCount - checkedCount))
                .replace("{total}", String(totalCount))}
        </p>
      )}

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          ref={input}
          className="composer__input"
          rows={1}
          value={text}
          placeholder={strings.inputPlaceholder}
          aria-label={strings.inputLabel}
          enterKeyHint="send"
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
                  className={
                    armed === s.product_id ? "suggest__forget suggest__forget--armed" : "suggest__forget"
                  }
                  aria-label={`${strings.forgetProduct}: ${s.name}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void forget(s)}
                >
                  {armed === s.product_id ? strings.forgetConfirm : "✕"}
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
      {!online && (
        <p className="alert alert--status" role="status">
          {strings.offline}
        </p>
      )}
      {online && error && (
        <div className="alert" role="alert">
          <span className="alert__text">
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
          </span>
          <button type="button" className="alert__action" onClick={() => void retry()}>
            {strings.retry}
          </button>
          <button
            type="button"
            className="alert__close"
            aria-label={strings.close}
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}
      {undoable && removed.length === 0 && (
        <div className="snackbar" role="status">
          <span className="snackbar__text">{`${strings.bought}: ${undoable.count} · ${strings.boughtSaved}`}</span>
          <button type="button" className="snackbar__action" onClick={() => void onUndo()}>
            {strings.undo}
          </button>
        </div>
      )}

      {contents && groups.length === 0 && justBought && (
        <section className="empty empty--done" aria-live="polite">
          <span className="empty__emoji" aria-hidden="true">
            ✅
          </span>
          <p className="empty__title">{strings.doneTitle}</p>
          <p className="empty__hint">{strings.doneHint}</p>
          <button type="button" className="empty__action" onClick={onOpenHistory}>
            {strings.history}
          </button>
        </section>
      )}
      {contents && groups.length === 0 && !justBought && (
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
            <span className="group__emoji" aria-hidden="true">
              {group.emoji}
            </span>
            <span className="group__name">{group.name}</span>
            {(() => {
              const left = group.entries.filter((e) => !e.checked).length;
              return (
                <span className="group__count" aria-label={withCount(strings.remaining, left)}>
                  {left > 0 ? left : "✓"}
                </span>
              );
            })()}
          </h2>
          <ul className="rows">
            {group.entries.map((entry) => (
              <li
                key={entry.id}
                className={["row", entry.checked && "row--checked", fresh.has(entry.id) && "row--new"]
                  .filter(Boolean)
                  .join(" ")}
              >
                {/* The whole row is the tap target for the aisle action (check / uncheck);
                    the trailing chevron is the separate, visible way into the Entry card. */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={entry.checked}
                  className="row__toggle"
                  onClick={() => toggle(entry.id, !entry.checked)}
                >
                  <span className="row__check" aria-hidden="true" />
                  <span className="row__text">
                    <span className="row__name">{entry.name}</span>
                    {entry.note && <span className="row__note">{entry.note}</span>}
                  </span>
                  {shared && (
                    <span className="row__by" aria-hidden="true">
                      <EntryAvatar members={list.members} addedBy={entry.added_by} />
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="row__open"
                  aria-label={`${strings.entryDetails}: ${entry.name}`}
                  onClick={() => openCard(entry.id)}
                >
                  <span aria-hidden="true">›</span>
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
      {info && (
        <div className="toast" role="status">
          {info}
        </div>
      )}
      {sheets}
    </main>
  );
}
