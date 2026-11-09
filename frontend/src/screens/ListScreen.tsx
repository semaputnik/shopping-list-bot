import type { ShoppingList } from "../api";
import { AvatarStack } from "../components/Avatar";
import type { Strings } from "../i18n";

interface Props {
  list: ShoppingList | null;
  strings: Strings;
  onOpenMembers: () => void;
}

/** The List screen: header with the List name and Members, then the empty state. */
export function ListScreen({ list, strings, onOpenMembers }: Props) {
  if (!list) {
    return (
      <main className="screen">
        <section className="empty">
          <p className="empty__title">{strings.noList}</p>
        </section>
      </main>
    );
  }
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
      </header>
      <section className="empty" aria-live="polite">
        <span className="empty__emoji" aria-hidden="true">
          🛒
        </span>
        <p className="empty__title">{strings.emptyTitle}</p>
        <p className="empty__hint">{strings.emptyHint}</p>
      </section>
    </main>
  );
}
