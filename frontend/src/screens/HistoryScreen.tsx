import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Cell,
  List,
  Placeholder,
  Section,
  Skeleton,
  Snackbar,
  Title,
} from "@telegram-apps/telegram-ui";
import { fetchHistory, readdFromHistory, type HistoryPurchase } from "../api";
import { ActionCell } from "../components/ActionCell";
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
  const sentinel = useRef<HTMLDivElement | null>(null);
  const busy = useRef(false);
  useEffect(() => bindBackButton(onBack), [onBack]);

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
      setToast(strings.historyAdded);
    } catch (error) {
      console.error(error);
      haptic.error();
      setToast(strings.historyAddFailed);
    }
  };

  return (
    <main className="screen">
      <Title level="1" weight="1" className="screen__title">
        {strings.history}
      </Title>
      {done && purchases.length === 0 && (
        <Placeholder
          header={strings.historyEmptyTitle}
          description={strings.historyEmpty}
          action={
            <Button size="m" mode="bezeled" onClick={onBack}>
              {strings.historyToList}
            </Button>
          }
        >
          <span className="placeholder__emoji" aria-hidden="true">
            🧾
          </span>
        </Placeholder>
      )}
      <List className="plain-list">
        {purchases.map((purchase) => (
          <Section
            key={purchase.id}
            header={`${formatWhen(purchase.purchased_at, language)}${
              purchase.purchased_by_name ? ` · ${purchase.purchased_by_name}` : ""
            }`}
          >
            {purchase.entries.map((item) => (
              <ActionCell
                key={item.id}
                multiline
                subtitle={item.note ?? undefined}
                after={
                  <span className="history__add" aria-label={strings.historyAddBack}>
                    {added.has(item.id) ? "✓" : "+"}
                  </span>
                }
                onClick={() => void readd(purchase.id, item.id)}
              >
                {item.name}
              </ActionCell>
            ))}
          </Section>
        ))}
      </List>
      {!done && <div ref={sentinel} className="history__sentinel" />}
      {load === "loading" && (
        <List className="plain-list" role="status" aria-busy="true" aria-label={strings.loading}>
          <Section>
            {[0, 1, 2].map((i) => (
              <Cell key={i}>
                <Skeleton visible className="skeleton__line" />
              </Cell>
            ))}
          </Section>
        </List>
      )}
      {load === "failed" && (
        <Placeholder
          header={strings.historyLoadFailed}
          action={
            <Button size="m" mode="bezeled" onClick={() => setLoad("idle")}>
              {strings.retry}
            </Button>
          }
        />
      )}
      {toast && (
        <Snackbar key={toast} className="snackbar" duration={2500} onClose={() => setToast(null)}>
          {toast}
        </Snackbar>
      )}
    </main>
  );
}
