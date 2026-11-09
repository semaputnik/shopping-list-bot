import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { addEntries, fetchContents, type ListContents, type ShoppingList } from "../api";
import { AvatarStack } from "../components/Avatar";
import { QUICK_ADD, withCount, type Language, type Strings } from "../i18n";
import { confirmDestructive, haptic } from "../telegram";
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
  onSelect: (id: number) => void;
  onOpenMembers: () => void;
  onOpenSettings: () => void;
  /** Mutations resolve true on success, false when the request failed. */
  onCreate: (name: string) => Promise<boolean>;
  onRename: (id: number, name: string) => Promise<boolean>;
  onLeave: (id: number) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
}

type Panel = null | "switcher" | "menu" | "create" | "rename";

const HIGHLIGHT_MS = 1600;

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
  onSelect,
  onOpenMembers,
  onOpenSettings,
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
  const open = (next: Panel, from: Panel = null) => {
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
  const [error, setError] = useState<"add" | "load" | null>(null);
  const [text, setText] = useState("");
  const [pendingQuick, setPendingQuick] = useState<ReadonlySet<string>>(new Set());
  const input = useRef<HTMLTextAreaElement>(null);
  const listId = list?.id;

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
              <button type="button" className="sheet-row sheet-row--accent" onClick={() => open("create", "switcher")}>
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
              <button type="button" className="sheet-row" onClick={() => open("rename", "menu")}>
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
          <button type="button" className="empty__action" onClick={() => open("create")}>
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
  return (
    <main className="screen">
      <header className="header">
        <h1 className="header__heading">
          <button
            type="button"
            className="header__switch"
            aria-haspopup="dialog"
            onClick={() => open("switcher")}
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
          onClick={() => open("menu")}
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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </form>
      {error && (
        <p className="notice" role="alert">
          {error === "add" ? strings.addFailed : strings.loadFailed}
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
                <span className="row__name">{entry.name}</span>
                {entry.note && <span className="row__note">{entry.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {sheets}
    </main>
  );
}
