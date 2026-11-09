import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  addEntries,
  fetchContents,
  fetchSuggestions,
  hideProduct,
  type ListContents,
  type ShoppingList,
  type Suggestion,
} from "../api";
import { AvatarStack } from "../components/Avatar";
import { QUICK_ADD, type Language, type Strings } from "../i18n";

interface Props {
  token: string;
  list: ShoppingList | null;
  language: Language;
  strings: Strings;
  onOpenMembers: () => void;
  onOpenSettings: () => void;
}

const HIGHLIGHT_MS = 1600;
const SUGGEST_DELAY_MS = 120;

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

/** The List screen: header with Members and Settings, the pinned input line, then Entries grouped by Category. */
export function ListScreen({ token, list, language, strings, onOpenMembers, onOpenSettings }: Props) {
  const [contents, setContents] = useState<ListContents | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<"add" | "load" | null>(null);
  const [text, setText] = useState("");
  const [pendingQuick, setPendingQuick] = useState<ReadonlySet<string>>(new Set());
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1); // index into the options; -1 = none highlighted
  const [dismissed, setDismissed] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const listId = list?.id;
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
    </main>
  );
}
