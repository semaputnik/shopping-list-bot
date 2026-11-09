import { useState } from "react";
import type { ShoppingList, User } from "../api";
import type { Strings } from "../i18n";

interface Props {
  user: User;
  list: ShoppingList | null;
  strings: Strings;
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
export function ListScreen({ user, list, strings }: Props) {
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
        <div className="avatars">
          <Avatar user={user} />
        </div>
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
