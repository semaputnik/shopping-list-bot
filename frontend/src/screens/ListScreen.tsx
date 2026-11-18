import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  Suspense,
} from "react";
import {
  Button,
  Cell,
  IconButton,
  List,
  Placeholder,
  Section,
  SegmentedControl,
  Skeleton,
  Snackbar,
} from "@telegram-apps/telegram-ui";
import {
  addEntries,
  buy,
  deleteEntry,
  fetchCategories,
  fetchChanges,
  fetchContents,
  fetchSuggestions,
  hideProduct,
  addAlias,
  removeAlias,
  renameProduct,
  restoreEntry,
  createStore,
  deleteStore,
  renameStore,
  setGrouping,
  setProductStore,
  updateEntry,
  uncheckAll,
  undoPurchase,
  type Category,
  type Grouping,
  type ListContents,
  type Store,
  type ShoppingList,
  type Suggestion,
  type TipKey,
} from "../api";
import { AvatarStack } from "../components/Avatar";
import { EntryGroups, groupEntries } from "../components/EntryGroups";
import { ActionCell } from "../components/ActionCell";
import { Popover } from "../components/Popover";
import { Tip } from "../components/Tip";
import { applyEntryChange } from "../entryChange";
import { QUICK_ADD, withCount, type Language, type Strings } from "../i18n";
import { shareList } from "../share";
import type { Remote } from "../sync";
import {
  bindMainButton,
  confirmDestructive,
  haptic,
  platform,
  setMainButtonText,
} from "../telegram";
import { EntryScreen, ListsScreen, StoresScreen, prefetchScreens } from "./lazyScreens";
import { NameScreen } from "./NameScreen";

interface Props {
  token: string;
  /** All the user's Lists, most recently changed first. */
  lists: ShoppingList[];
  list: ShoppingList | null;
  language: Language;
  strings: Strings;
  /** Onboarding tips the user already closed. */
  dismissedTips: readonly TipKey[];
  onDismissTip: (key: TipKey) => void;
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

type Panel = null | "switcher" | "menu" | "create" | "rename" | "stores";

const HIGHLIGHT_MS = 1600;
// The input line can size itself to its content (CSS field-sizing); not in older iOS WebKit.
const FIELD_SIZING = typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");
const SUGGEST_DELAY_MS = 120;
// Undo stays for at least this long. A snackbar closes itself after it, then plays a 320 ms exit.
const UNDO_MS = 5000;
const SNACKBAR_EXIT_MS = 400;

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
  dismissedTips,
  onDismissTip,
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
  // Where the List was scrolled when a screen (an Entry, the Lists) replaced it.
  const listScroll = useRef(0);
  const openPanel = (next: Panel, from: Panel = null) => {
    if (next !== "menu" && (panel === null || panel === "menu")) {
      listScroll.current = window.scrollY;
    }
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
  const [boughtNames, setBoughtNames] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const { start: segmentStart, query } = currentSegment(text);
  const isNew = query !== "" && !suggestions.some(
    (s) => fold(s.name) === fold(query) || (s.matched_alias && fold(s.matched_alias) === fold(query)),
  );
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

  // Once the List is on screen, warm the screens and sheets it can open (split chunks).
  useEffect(() => {
    if (contents) prefetchScreens();
  }, [contents]);

  // Fetched up front so the card's select is ready; retried on open if that failed.
  useEffect(loadCategories, [loadCategories]);

  const openCard = (id: number) => {
    listScroll.current = window.scrollY;
    setOpenId(id);
    if (categories.length === 0) loadCategories();
  };

  const closeCard = useCallback(() => setOpenId(null), []);

  const onOtherScreen =
    openId !== null ||
    panel === "switcher" ||
    panel === "stores" ||
    panel === "create" ||
    panel === "rename";
  useLayoutEffect(() => {
    window.scrollTo(0, onOtherScreen ? 0 : listScroll.current);
  }, [onOtherScreen]);

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

  /** Renames the open Entry's Product everywhere in the List, then shows the result. */
  const renameOpenProduct = useCallback(
    async (name: string) => {
      const entry = contentsRef.current?.categories
        .flatMap((g) => g.entries)
        .find((e) => e.id === openId);
      if (listId === undefined || !entry) return;
      markOwn(entry.id);
      await renameProduct(token, listId, entry.product_id, name);
      await refresh();
    },
    [token, listId, openId, markOwn, refresh],
  );

  /** The open Entry's Product, for the alias edits below. */
  const openProductId = useCallback(
    () =>
      contentsRef.current?.categories.flatMap((g) => g.entries).find((e) => e.id === openId)
        ?.product_id,
    [openId],
  );

  const addOpenAlias = useCallback(
    async (name: string) => {
      const productId = openProductId();
      if (listId === undefined || productId === undefined || openId === null) return;
      markOwn(openId);
      await addAlias(token, listId, productId, name);
      await refresh();
    },
    [token, listId, openId, openProductId, markOwn, refresh],
  );

  const changeOpenStore = useCallback(
    async (storeId: number | null) => {
      const productId = openProductId();
      if (listId === undefined || productId === undefined || openId === null) return;
      markOwn(openId);
      await setProductStore(token, listId, productId, storeId);
      await refresh();
    },
    [token, listId, openId, openProductId, markOwn, refresh],
  );

  const addStore = useCallback(
    async (name: string): Promise<Store> => {
      if (listId === undefined) throw new Error("no list");
      const { store } = await createStore(token, listId, name);
      await refresh();
      return store;
    },
    [token, listId, refresh],
  );

  const editStore = useCallback(
    async (id: number, name: string) => {
      if (listId === undefined) return;
      await renameStore(token, listId, id, name);
      await refresh();
    },
    [token, listId, refresh],
  );

  const dropStore = useCallback(
    async (id: number) => {
      if (listId === undefined) return;
      await deleteStore(token, listId, id);
      await refresh();
    },
    [token, listId, refresh],
  );

  const removeOpenAlias = useCallback(
    async (aliasId: number) => {
      const productId = openProductId();
      if (listId === undefined || productId === undefined || openId === null) return;
      markOwn(openId);
      await removeAlias(token, listId, productId, aliasId);
      await refresh();
    },
    [token, listId, openId, openProductId, markOwn, refresh],
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
    // rather than left to expire unseen behind this one. Deleted Entries stay undoable, oldest first.
    setUndoable(null);
    setRemoved((prev) => [...prev, { id, name }]);
    window.setTimeout(
      () => setRemoved((prev) => prev.filter((r) => r.id !== id)),
      UNDO_MS + SNACKBAR_EXIT_MS,
    );
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

  // Grow the textarea with its content. Where CSS `field-sizing: content` works (styles.css) there
  // is nothing to do. Older iOS WebKit lacks it: there, resetting the height to `auto` relayouts
  // the whole page, so it happens only when the text got shorter; growing just reads the size.
  const typedLength = useRef(0);
  useLayoutEffect(() => {
    const el = input.current;
    const shorter = text.length < typedLength.current;
    typedLength.current = text.length;
    if (!el || FIELD_SIZING) return;
    if (shorter) el.style.height = "auto";
    if (shorter || el.scrollHeight > el.clientHeight) el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  /** Closes a tip for good once the user did what it teaches. */
  const settle = useCallback(
    (key: TipKey) => {
      if (!dismissedTips.includes(key)) onDismissTip(key);
    },
    [dismissedTips, onDismissTip],
  );

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
      if (ids.length > 1) settle("multi_add"); // adding one item does not use the gesture
    },
    [token, listId, showContents, flash, settle],
  );

  /** Applies a Checked state to the local copy right away; the Entry never moves. */
  const applyChecked = useCallback((match: (id: number) => boolean, checked: boolean) => {
    setContents((prev) =>
      prev && {
        ...prev,
        // Untouched groups keep their identity, so their memoised sections skip the re-render.
        categories: prev.categories.map((g) =>
          g.entries.some((e) => match(e.id) && e.checked !== checked)
            ? { ...g, entries: g.entries.map((e) => (match(e.id) ? { ...e, checked } : e)) }
            : g,
        ),
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

  // Stable handlers for the memoised rows: they always call the latest toggle / openCard.
  const latest = useRef({ toggle, openCard });
  latest.current = { toggle, openCard };
  const onToggleRow = useCallback(
    (id: number, checked: boolean) => latest.current.toggle(id, checked),
    [],
  );
  const onOpenRow = useCallback((id: number) => latest.current.openCard(id), []);

  const checkedCount = (contents?.categories ?? []).reduce(
    (n, g) => n + g.entries.filter((e) => e.checked).length,
    0,
  );
  const anyChecked = checkedCount > 0;
  const totalCount = (contents?.categories ?? []).reduce((n, g) => n + g.entries.length, 0);
  const shared = (list?.members.length ?? 0) > 1;
  const allInBasket = totalCount > 0 && checkedCount === totalCount;

  // Grouping by Store only means something once the List has a Store; it is personal (no event).
  const stores = useMemo(() => contents?.stores ?? [], [contents?.stores]);
  const grouping: Grouping = stores.length > 0 ? (contents?.grouping ?? "category") : "category";
  const shown = useMemo(
    () => groupEntries(contents?.categories ?? [], stores, grouping, strings),
    [contents?.categories, stores, grouping, strings],
  );
  // Keyed on which Categories are shown, not on the groups array (that changes on every check
  // and would re-render every memoised section).
  const emojiKey = (contents?.categories ?? []).map((g) => `${g.key}:${g.emoji}`).join(",");
  const categoryEmoji = useMemo(
    () => new Map(emojiKey.split(",").filter(Boolean).map((pair) => pair.split(":") as [string, string])),
    [emojiKey],
  );
  const changeGrouping = (next: Grouping) => {
    if (listId === undefined || next === grouping) return;
    haptic.select();
    setContents((prev) => prev && { ...prev, grouping: next });
    setGrouping(token, listId, next).catch((e) => console.error(e));
  };
  // The moment the last Entry goes into the basket gets one success tap, not every render.
  const wasAllInBasket = useRef(allInBasket);
  useEffect(() => {
    if (allInBasket && !wasAllInBasket.current) haptic.success();
    wasAllInBasket.current = allInBasket;
  }, [allInBasket]);

  const dismissUndo = useCallback(() => setUndoable(null), []);
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
      const bought = (contentsRef.current?.categories ?? [])
        .flatMap((g) => g.entries)
        .filter((e) => e.checked)
        .map((e) => e.name);
      const result = await buy(token, listId);
      setBoughtNames(bought);
      showContents(await fetchContents(token, listId));
      setRemoved([]); // the newest action owns the snackbar (see removeEntry)
      setUndoable({ id: result.id, listId, count: result.count });
      setJustBought(true);
      settle("bought");
    } catch (e) {
      console.error(e);
      reload("buy");
    } finally {
      buying.current = false;
    }
  }, [token, listId, showContents, reload, settle]);

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
    settle("invite"); // someone who shares needs no hint to share
    const result = await shareList(token, list, strings.shareText.replace("{name}", list.name));
    if (result === "unavailable") haptic.error();
    else haptic.success();
    if (result === "shared") return; // Telegram's own picker is the feedback
    setInfo(result === "copied" ? strings.linkCopied : strings.linkUnavailable);
  };

  const sheets = failed && (
    <p className="alert" role="alert">
      {strings.actionFailed}
    </p>
  );

  // Naming a List is a screen of its own, replacing whatever was showing (see NameScreen).
  if (panel === "create") {
    return (
      <NameScreen
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
    );
  }
  if (panel === "rename" && list) {
    return (
      <NameScreen
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
    );
  }

  if (!list) {
    return (
      <main className="screen">
        <Placeholder
          header={strings.noList}
          action={
            <div className="placeholder__actions">
              <Button size="l" mode="filled" onClick={() => openPanel("create")}>
                {strings.newList}
              </Button>
              <Button size="l" mode="plain" onClick={onOpenSettings}>
                {strings.settings}
              </Button>
            </div>
          }
        />
        {sheets}
      </main>
    );
  }

  const groups = contents?.categories ?? [];
  const openEntry =
    openId === null ? null : (groups.flatMap((g) => g.entries).find((e) => e.id === openId) ?? null);

  // An Entry and the Lists open as their own screens, replacing the List (see EntryScreen).
  if (openEntry) {
    return (
      <Suspense fallback={null}>
      <EntryScreen
        key={openEntry.id}
        entry={openEntry}
        categories={categories}
        categoryName={groups.find((g) => g.key === openEntry.category)?.name ?? ""}
        language={language}
        strings={strings}
        onSaveNote={saveNote}
        onChangeCategory={changeCategory}
        stores={contents?.stores ?? []}
        onChangeStore={changeOpenStore}
        onCreateStore={addStore}
        onRename={renameOpenProduct}
        onAddAlias={addOpenAlias}
        onRemoveAlias={removeOpenAlias}
        onDelete={() => void removeEntry(openEntry.id, openEntry.name)}
        onSaveFailed={() => setError("save")}
        onClose={closeCard}
      />
      </Suspense>
    );
  }
  if (panel === "stores") {
    return (
      <Suspense fallback={null}>
      <StoresScreen
        stores={contents?.stores ?? []}
        strings={strings}
        onCreate={addStore}
        onRename={editStore}
        onDelete={dropStore}
        onBack={close}
      />
      </Suspense>
    );
  }
  if (panel === "switcher") {
    return (
      <Suspense fallback={null}>
        <ListsScreen
          lists={lists}
          currentId={list.id}
          strings={strings}
          onSelect={(id) => {
            onSelect(id);
            close();
          }}
          onCreate={() => openPanel("create", "switcher")}
          onBack={close}
        />
        {sheets}
      </Suspense>
    );
  }
  const lastRemoved = removed.at(-1);

  // One tip at a time, and none while something else floats or covers the screen. The tip for
  // the first check outranks the invite tip; each shows until the user closes it or does what it teaches.
  const tipOpen = (key: TipKey) => !dismissedTips.includes(key);
  const busyAbove = panel !== null || openId !== null || lastRemoved || undoable || info;
  let tip: { key: TipKey; icon: string; title: string; text: string; action?: ReactNode } | null =
    null;
  if (contents && !busyAbove) {
    if (anyChecked && tipOpen("bought")) {
      tip = { key: "bought", icon: "✅", title: strings.tipBoughtTitle, text: strings.tipBoughtText };
    } else if (totalCount === 0 && !justBought && tipOpen("multi_add")) {
      tip = {
        key: "multi_add",
        icon: "📝",
        title: strings.tipMultiAddTitle,
        text: strings.tipMultiAddText,
      };
    } else if (totalCount > 0 && !shared && tipOpen("invite")) {
      tip = {
        key: "invite",
        icon: "👨‍👩‍👧",
        title: strings.tipInviteTitle,
        text: strings.tipInviteText,
        action: (
          <Button size="s" mode="bezeled" onClick={() => void onShare()}>
            {strings.shareList}
          </Button>
        ),
      };
    }
  }

  return (
    <main className={tip ? "screen screen--with-tip" : "screen"}>
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
        <div className="header__menu-wrap">
          <IconButton
            mode="plain"
            size="l"
            className="header__menu"
            aria-label={strings.listMenu}
            aria-haspopup="menu"
            aria-expanded={panel === "menu"}
            onClick={() => openPanel("menu")}
          >
            <span aria-hidden="true">⋯</span>
          </IconButton>
          {panel === "menu" && (
            <Popover label={strings.listMenu} onClose={close}>
              {(choose) => (
                <>
                  <Section>
                    <ActionCell role="menuitem" tone="accent" onClick={() => choose(() => void onShare())}>
                      {strings.shareList}
                    </ActionCell>
                    <ActionCell role="menuitem" disabled={!anyChecked} onClick={() => choose(onUncheckAll)}>
                      {strings.uncheckAll}
                    </ActionCell>
                    <ActionCell role="menuitem" onClick={() => choose(onOpenHistory)}>
                      {strings.history}
                    </ActionCell>
                    <ActionCell role="menuitem" onClick={() => choose(() => openPanel("stores"))}>
                      {strings.stores}
                    </ActionCell>
                  </Section>
                  <Section>
                    <ActionCell role="menuitem" onClick={() => choose(() => openPanel("rename", "menu"))}>
                      {strings.renameList}
                    </ActionCell>
                    <ActionCell role="menuitem" onClick={() => choose(onOpenSettings)}>
                      {strings.settings}
                    </ActionCell>
                  </Section>
                  {/* Destructive actions live in their own group, away from routine ones. */}
                  <Section>
                    <ActionCell role="menuitem" tone="destructive" onClick={() => choose(() => void leave())}>
                      {strings.leaveList}
                    </ActionCell>
                    <ActionCell role="menuitem" tone="destructive" onClick={() => choose(() => void remove())}>
                      {strings.deleteList}
                    </ActionCell>
                  </Section>
                </>
              )}
            </Popover>
          )}
        </div>
      </header>

      {totalCount > 0 && (
        <div className={allInBasket ? "progress progress--full" : "progress"}>
          <p className="progress__text" aria-live="polite">
            {allInBasket
              ? strings.allInBasket
              : strings.progress
                  .replace("{left}", String(totalCount - checkedCount))
                  .replace("{total}", String(totalCount))}
          </p>
          <span className="progress__track" aria-hidden="true">
            <span
              className="progress__fill"
              style={{ transform: `scaleX(${checkedCount / totalCount})` }}
            />
          </span>
        </div>
      )}

      {stores.length > 0 && totalCount > 0 && (
        <SegmentedControl className="grouping" aria-label={strings.groupBy}>
          {(["category", "store"] as const).map((g) => (
            <SegmentedControl.Item
              key={g}
              type="button"
              selected={grouping === g}
              aria-pressed={grouping === g}
              onClick={() => changeGrouping(g)}
            >
              {g === "category" ? strings.groupByCategory : strings.groupByStore}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
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
                  {s.matched_alias && <span className="suggest__alias">· {s.matched_alias}</span>}
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
      {online && error && !(error === "load" && !contents) && (
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
      {contents && groups.length === 0 && justBought && (
        <Placeholder
          header={strings.doneTitle}
          description={
            <>
              {boughtNames.length > 0 && (
                <>
                  {boughtNames.length <= 3
                    ? boughtNames.join(", ")
                    : `${boughtNames.slice(0, 3).join(", ")} ${withCount(strings.andMore, boughtNames.length - 3)}`}
                  <br />
                </>
              )}
              {strings.doneHint}
            </>
          }
          action={
            <Button size="m" mode="bezeled" onClick={onOpenHistory}>
              {strings.history}
            </Button>
          }
        >
          <span className="placeholder__emoji" aria-hidden="true">
            ✅
          </span>
        </Placeholder>
      )}
      {contents && groups.length === 0 && !justBought && (
        <Placeholder
          header={strings.emptyTitle}
          description={strings.emptyInputHint}
          action={
            <div>
              <p className="quick-add__lead">{strings.emptyHint}</p>
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
            </div>
          }
        >
          <span className="placeholder__emoji" aria-hidden="true">
            🛒
          </span>
        </Placeholder>
      )}

      {!contents && error === "load" && (
        <Placeholder
          header={strings.loadFailed}
          action={
            <Button size="m" mode="bezeled" onClick={() => void retry()}>
              {strings.retry}
            </Button>
          }
        />
      )}

      {!contents && error !== "load" && (
        <List className="groups" data-platform={platform} role="status" aria-busy="true" aria-label={strings.loading}>
          <Section>
            {[0, 1, 2, 3].map((i) => (
              <Cell key={i} before={<Skeleton visible className="skeleton__check" />}>
                <Skeleton visible className="skeleton__line" />
              </Cell>
            ))}
          </Section>
        </List>
      )}

      <EntryGroups
        groups={shown}
        grouping={grouping}
        categoryEmoji={categoryEmoji}
        fresh={fresh}
        members={list.members}
        strings={strings}
        onToggle={onToggleRow}
        onOpen={onOpenRow}
      />
      {tip && (
        <Tip
          key={tip.key}
          icon={tip.icon}
          title={tip.title}
          text={tip.text}
          closeLabel={strings.close}
          onClose={() => onDismissTip(tip.key)}
          action={tip.action}
        />
      )}
      {lastRemoved ? (
        <Snackbar
          key={lastRemoved.id}
          className="snackbar"
          duration={UNDO_MS}
          onClose={() => setRemoved((prev) => prev.filter((r) => r.id !== lastRemoved.id))}
          after={<Snackbar.Button onClick={() => void undoRemove()}>{strings.undo}</Snackbar.Button>}
        >
          {strings.entryDeleted}: {lastRemoved.name}
        </Snackbar>
      ) : undoable ? (
        <Snackbar
          key={undoable.id}
          className="snackbar"
          duration={UNDO_MS}
          onClose={dismissUndo}
          after={<Snackbar.Button onClick={() => void onUndo()}>{strings.undo}</Snackbar.Button>}
        >
          {`${strings.bought}: ${undoable.count} · ${strings.boughtSaved}`}
        </Snackbar>
      ) : (
        info && (
          <Snackbar key={info} className="snackbar" duration={2500} onClose={() => setInfo(null)}>
            {info}
          </Snackbar>
        )
      )}
      {sheets}
    </main>
  );
}
