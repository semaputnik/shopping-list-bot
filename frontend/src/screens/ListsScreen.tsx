import { useEffect } from "react";
import { List, Section, Title } from "@telegram-apps/telegram-ui";
import type { ShoppingList } from "../api";
import { ActionCell } from "../components/ActionCell";
import { withCount, type Strings } from "../i18n";
import { bindBackButton, haptic } from "../telegram";

interface Props {
  lists: ShoppingList[];
  currentId: number | null;
  strings: Strings;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onBack: () => void;
}

/** The user's Lists, to switch between them or start a new one. */
export function ListsScreen({
  lists,
  currentId,
  strings,
  onSelect,
  onCreate,
  onBack,
}: Props) {
  useEffect(() => bindBackButton(onBack), [onBack]);
  return (
    <main className="screen">
      <Title level="1" weight="1" className="screen__title">
        {strings.switchList}
      </Title>
      <List>
        <Section>
          {lists.map((l) => (
            <ActionCell
              key={l.id}
              aria-current={l.id === currentId}
              className={l.id === currentId ? "cell--current" : undefined}
              after={l.id === currentId ? "✓" : withCount(strings.membersCount, l.members.length)}
              onClick={() => {
                if (l.id !== currentId) haptic.select();
                onSelect(l.id);
              }}
            >
              {l.name}
            </ActionCell>
          ))}
        </Section>
        <Section>
          <ActionCell tone="accent" onClick={onCreate}>
            {strings.newList}
          </ActionCell>
        </Section>
      </List>
    </main>
  );
}
