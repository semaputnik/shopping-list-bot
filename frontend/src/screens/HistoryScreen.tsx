import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHistory, readdFromHistory, type HistoryPurchase } from "../api";
import type { Language, Strings } from "../i18n";
import { bindBackButton, haptic } from "../telegram";

interface Props {
  token: string;
  listId: number;
  language: Language;
  strings: Strings;
  onBack: () => void;
}

const PAGE_SIZE = 20;

type Load = "idle" | "loading" | "failed";

/** "9 ноября, 18:40" in the interface language. */
function formatWhen(iso: string, language: Language): string {
  return new Date(iso).toLocaleString(language, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The List's History: past Purchases newest first, paged while scrolling; tap an item to re-add it. */
export function HistoryScreen({ token, listId, language, strings, onBack }: Props) {
  const [purchases, setPurchases] = useState<HistoryPurchase[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [load, setLoad] = useState<Load>("idle");
  /** Items re-added during this visit, marked so a second tap is a deliberate one. */
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const busy = useRef(false);
  useEffect(() => bindBackButton(onBack), [onBack]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const showToast = (text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  };

  const loadMore = useCallback(async () => {
    if (busy.current || done) return;
    busy.current = true;
    setLoad("loading");
    try {
      const page = await fetchHistory(token, listId, cursor, PAGE_SIZE);
      setPurchases((prev) => [...prev, ...page.purchases]);
      setCursor(page.next_cursor);
      setDone(page.next_cursor === null);
      setLoad("idle");
    } catch (error) {
      console.error(error);
      setLoad("failed");
    } finally {
      busy.current = false;
    }
  }, [token, listId, cursor, done]);

  // Load the next page whenever the sentinel under the last Purchase scrolls into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || done || load === "failed") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, done, load]);

  const readd = async (purchaseId: number, itemId: number) => {
    try {
      await readdFromHistory(token, listId, purchaseId, itemId, crypto.randomUUID());
      setAdded((prev) => new Set(prev).add(itemId));
      haptic.success();
      showToast(strings.historyAdded);
    } catch (error) {
      console.error(error);
      haptic.error();
      showToast(strings.historyAddFailed);
    }
  };

  return (
    <main className="screen">
      <h1 className="screen__title">{strings.history}</h1>
      {done && purchases.length === 0 && (
        <p className="history__empty">{strings.historyEmpty}</p>
      )}
      <ul className="history">
        {purchases.map((purchase) => (
          <li key={purchase.id} className="history__purchase">
            <div className="history__when">
              {formatWhen(purchase.purchased_at, language)}
              {purchase.purchased_by_name && ` · ${purchase.purchased_by_name}`}
            </div>
            <ul className="history__items">
              {purchase.entries.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="history__item"
                    onClick={() => void readd(purchase.id, item.id)}
                  >
                    <span className="history__name">
                      {item.name}
                      {item.note && <span className="history__note"> · {item.note}</span>}
                    </span>
                    <span className="history__add" aria-label={strings.historyAddBack}>
                      {added.has(item.id) ? "✓" : "+"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {!done && <div ref={sentinel} className="history__sentinel" />}
      {load === "loading" && <p className="history__status">{strings.loading}</p>}
      {load === "failed" && (
        <div className="history__status">
          <p>{strings.historyLoadFailed}</p>
          <button type="button" className="text-button" onClick={() => setLoad("idle")}>
            {strings.retry}
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
