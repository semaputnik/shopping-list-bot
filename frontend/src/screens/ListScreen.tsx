import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { addEntries, fetchContents, type ListContents, type ShoppingList, type User } from "../api";
import { QUICK_ADD, type Language, type Strings } from "../i18n";

interface Props {
  token: string;
  user: User;
  list: ShoppingList | null;
  language: Language;
  strings: Strings;
}

const HIGHLIGHT_MS = 1600;

function initials(user: User): string {
  const letters = [user.first_name, user.last_name].map((s) => (s ?? "").trim()[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

function Avatar({ user }: { user: User }) {
  const [broken, setBroken] = useState(false);
  if (user.photo_url && !broken) {
    return (
      <img
        className="avatar"
        src={user.photo_url}
        alt={user.first_name}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="avatar avatar--initials" aria-label={user.first_name}>
      {initials(user)}
    </span>
  );
}

/** The List screen: header, the pinned input line, then Entries grouped by Category. */
export function ListScreen({ token, user, list, language, strings }: Props) {
  const [contents, setContents] = useState<ListContents | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<"add" | "load" | null>(null);
  const [text, setText] = useState("");
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

  if (!list) {
    return (
      <main className="screen">
        <section className="empty">
          <p className="empty__title">{strings.noList}</p>
        </section>
      </main>
    );
  }

  const groups = contents?.categories ?? [];
  return (
    <main className="screen">
      <header className="header">
        <h1 className="header__title">{list.name}</h1>
        <div className="avatars">
          <Avatar user={user} />
        </div>
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
              <button key={name} type="button" className="quick__button" onClick={() => void submit(name)}>
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
    </main>
  );
}
