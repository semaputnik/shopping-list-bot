import { useState } from "react";
import type { ShoppingList, User } from "../api";
import { withCount, type Strings } from "../i18n";
import { confirmDestructive } from "../telegram";
import { NameSheet, Sheet } from "./Sheet";

interface Props {
  user: User;
  /** All the user's Lists, most recently changed first. */
  lists: ShoppingList[];
  list: ShoppingList | null;
  strings: Strings;
  /** True when the last action failed on the server. */
  failed: boolean;
  onSelect: (id: number) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: number, name: string) => Promise<void>;
  onLeave: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

type Panel = null | "switcher" | "menu" | "create" | "rename";

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
export function ListScreen({
  user,
  lists,
  list,
  strings,
  failed,
  onSelect,
  onCreate,
  onRename,
  onLeave,
  onDelete,
}: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const close = () => setPanel(null);

  const leave = async () => {
    if (!list) return;
    close();
    const ok = await confirmDestructive({
      title: strings.leaveTitle,
      message: list.member_count <= 1 ? strings.leaveLastMessage : strings.leaveMessage,
      confirmLabel: strings.leaveList,
    });
    if (ok) await onLeave(list.id);
  };

  const remove = async () => {
    if (!list) return;
    close();
    const ok = await confirmDestructive({
      title: strings.deleteTitle,
      message: withCount(strings.deleteMessage, list.member_count),
      confirmLabel: strings.deleteList,
    });
    if (ok) await onDelete(list.id);
  };

  const sheets = (
    <>
      {failed && (
        <p className="toast" role="alert">
          {strings.actionFailed}
        </p>
      )}
      {panel === "switcher" && (
        <Sheet title={strings.switchList} onClose={close} closeLabel={strings.cancel}>
          <ul className="rows">
            {lists.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="row"
                  aria-current={l.id === list?.id}
                  onClick={() => {
                    onSelect(l.id);
                    close();
                  }}
                >
                  <span className="row__name">{l.name}</span>
                  <span className="row__meta">
                    {l.id === list?.id ? "✓" : withCount(strings.membersCount, l.member_count)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <ul className="rows">
            <li>
              <button type="button" className="row row--accent" onClick={() => setPanel("create")}>
                {strings.newList}
              </button>
            </li>
          </ul>
        </Sheet>
      )}
      {panel === "menu" && list && (
        <Sheet title={strings.listMenu} onClose={close} closeLabel={strings.cancel}>
          <ul className="rows">
            <li>
              <button type="button" className="row" onClick={() => setPanel("rename")}>
                {strings.renameList}
              </button>
            </li>
            <li>
              <button type="button" className="row" onClick={() => void leave()}>
                {strings.leaveList}
              </button>
            </li>
            <li>
              <button type="button" className="row row--destructive" onClick={() => void remove()}>
                {strings.deleteList}
              </button>
            </li>
          </ul>
        </Sheet>
      )}
      {panel === "create" && (
        <NameSheet
          title={strings.newList}
          label={strings.listName}
          placeholder={strings.listNamePlaceholder}
          submitLabel={strings.createList}
          cancelLabel={strings.cancel}
          initial=""
          onClose={close}
          onSubmit={async (name) => {
            close();
            await onCreate(name);
          }}
        />
      )}
      {panel === "rename" && list && (
        <NameSheet
          title={strings.renameList}
          label={strings.listName}
          placeholder={strings.listNamePlaceholder}
          submitLabel={strings.save}
          cancelLabel={strings.cancel}
          initial={list.name}
          onClose={close}
          onSubmit={async (name) => {
            close();
            await onRename(list.id, name);
          }}
        />
      )}
    </>
  );

  if (!list) {
    return (
      <main className="screen">
        <section className="empty">
          <p className="empty__title">{strings.noList}</p>
          <button type="button" className="empty__action" onClick={() => setPanel("create")}>
            {strings.newList}
          </button>
        </section>
        {sheets}
      </main>
    );
  }
  return (
    <main className="screen">
      <header className="header">
        <button
          type="button"
          className="header__switch"
          aria-haspopup="dialog"
          onClick={() => setPanel("switcher")}
        >
          <h1 className="header__title">{list.name}</h1>
          <span className="header__chevron" aria-hidden="true">
            ▾
          </span>
        </button>
        <div className="avatars">
          <Avatar user={user} />
        </div>
        <button
          type="button"
          className="header__menu"
          aria-label={strings.listMenu}
          onClick={() => setPanel("menu")}
        >
          ⋯
        </button>
      </header>
      <section className="empty" aria-live="polite">
        <span className="empty__emoji" aria-hidden="true">
          🛒
        </span>
        <p className="empty__title">{strings.emptyTitle}</p>
        <p className="empty__hint">{strings.emptyHint}</p>
      </section>
      {sheets}
    </main>
  );
}
