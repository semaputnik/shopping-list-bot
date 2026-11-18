import { memo } from "react";
import { List, Section } from "@telegram-apps/telegram-ui";
import type { CategoryGroup, Entry, Grouping, Member, Store } from "../api";
import { withCount, type Strings } from "../i18n";
import { platform } from "../telegram";
import { EntryRow } from "./EntryRow";

/** One section of the List screen: a Category, a Store or «Без магазина». */
export interface EntryGroup {
  key: string;
  emoji: string;
  name: string;
  entries: Entry[];
  /** A note under the section. */
  hint?: string;
}

/**
 * What the List shows: the Category groups, or by Store (each Store in name order, «Без магазина»
 * last); inside a Store the rows keep the Category order.
 */
export function groupEntries(
  categories: CategoryGroup[],
  stores: Store[],
  grouping: Grouping,
  strings: Strings,
): EntryGroup[] {
  if (grouping !== "store") return categories;
  const ordered = categories.flatMap((g) => g.entries);
  const known = new Set(stores.map((st) => st.id));
  const byStore: EntryGroup[] = stores.map((st) => ({
    key: `store-${st.id}`,
    emoji: "🏪",
    name: st.name,
    entries: ordered.filter((e) => e.store_id === st.id),
  }));
  const unassigned = ordered.filter((e) => e.store_id === null || !known.has(e.store_id));
  byStore.push({
    key: "store-none",
    emoji: "🧺",
    name: strings.noStore,
    entries: unassigned,
    hint: unassigned.length === ordered.length ? strings.noStoreHint : undefined,
  });
  return byStore.filter((sec) => sec.entries.length > 0);
}

interface SectionProps extends Omit<Props, "groups"> {
  group: EntryGroup;
}

/** One section; memoised, so checking a row re-renders only the section that holds it. */
const GroupSection = memo(function GroupSection({
  group,
  grouping,
  categoryEmoji,
  fresh,
  members,
  strings,
  onToggle,
  onOpen,
}: SectionProps) {
  const left = group.entries.filter((e) => !e.checked).length;
  return (
    <Section
      className={left === 0 ? "group group--done" : "group"}
      footer={group.hint}
      header={
        <h2 className="group__header">
          <span className="group__emoji" aria-hidden="true">
            {group.emoji}
          </span>
          <span className="group__name">{group.name}</span>
          <span className="group__count" aria-label={withCount(strings.remaining, left)}>
            {left > 0 ? left : "✓"}
          </span>
        </h2>
      }
    >
      {group.entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          isNew={fresh.has(entry.id)}
          members={members}
          categoryEmoji={grouping === "store" ? categoryEmoji.get(entry.category) : undefined}
          detailsLabel={strings.entryDetails}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ))}
    </Section>
  );
});

interface Props {
  groups: EntryGroup[];
  grouping: Grouping;
  /** Category key → emoji, for the rows of the Store grouping. */
  categoryEmoji: Map<string, string>;
  /** Entries just added (they play the arrival wash). */
  fresh: ReadonlySet<number>;
  members: Member[];
  strings: Strings;
  onToggle: (id: number, checked: boolean) => void;
  onOpen: (id: number) => void;
}

/**
 * The List's sections. Memoised with the rows: typing in the input line re-renders neither the
 * sections nor their rows (tgui's Section would otherwise rebuild every divider on each keystroke).
 */
export const EntryGroups = memo(function EntryGroups({
  groups,
  grouping,
  categoryEmoji,
  fresh,
  members,
  strings,
  onToggle,
  onOpen,
}: Props) {
  return (
    <List className="groups" data-platform={platform}>
      {groups.map((group) => (
        <GroupSection
          key={group.key}
          group={group}
          grouping={grouping}
          categoryEmoji={categoryEmoji}
          fresh={fresh}
          members={members}
          strings={strings}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ))}
    </List>
  );
});
