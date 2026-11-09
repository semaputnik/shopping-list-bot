import { useState } from "react";
import type { ShoppingList, User } from "../api";
import type { Strings } from "../i18n";

interface Props {
  user: User;
  list: ShoppingList | null;
  strings: Strings;
  onOpenSettings: () => void;
}

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

/** The List screen: header with the List name and Members, then the empty state. */
export function ListScreen({ user, list, strings, onOpenSettings }: Props) {
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
        <div className="avatars">
          <Avatar user={user} />
        </div>
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
