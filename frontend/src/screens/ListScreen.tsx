import type { ShoppingList } from "../api";
import { AvatarStack } from "../components/Avatar";
import type { Strings } from "../i18n";

interface Props {
  list: ShoppingList | null;
  strings: Strings;
  onOpenMembers: () => void;
  onOpenSettings: () => void;
}

/** The List screen: header with the List name, Members and Settings, then the empty state. */
export function ListScreen({ list, strings, onOpenMembers, onOpenSettings }: Props) {
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
