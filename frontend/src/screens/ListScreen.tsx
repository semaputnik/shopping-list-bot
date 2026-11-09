import { useCallback, useState } from "react";
import type { ShoppingList } from "../api";
import { AvatarStack } from "../components/Avatar";
import { withCount, type Strings } from "../i18n";
import { confirmDestructive, haptic } from "../telegram";
import { NameSheet, Sheet } from "./Sheet";

interface Props {
  /** All the user's Lists, most recently changed first. */
  lists: ShoppingList[];
  list: ShoppingList | null;
  strings: Strings;
  /** True when the last action failed on the server. */
  failed: boolean;
  onSelect: (id: number) => void;
  onOpenMembers: () => void;
  /** Mutations resolve true on success, false when the request failed. */
  onCreate: (name: string) => Promise<boolean>;
  onRename: (id: number, name: string) => Promise<boolean>;
  onLeave: (id: number) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
}

type Panel = null | "switcher" | "menu" | "create" | "rename";

/** The List screen: header with the List name and Members, then the empty state. */
export function ListScreen({
  lists,
  list,
  strings,
  failed,
  onSelect,
  onOpenMembers,
  onCreate,
  onRename,
  onLeave,
  onDelete,
}: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  // The sheet the BackButton returns to; null closes the sheets altogether.
  const [parent, setParent] = useState<Panel>(null);
  const close = useCallback(() => {
    setParent(null);
    setPanel(null);
  }, []);
  const open = (next: Panel, from: Panel = null) => {
    setParent(from);
    setPanel(next);
  };
  // Back from a nested sheet returns to its parent (and forgets it); otherwise closes all.
  const back = useCallback(() => {
    setParent(null);
    setPanel(parent);
  }, [parent]);

  const leave = async () => {
    if (!list) return;
    close();
    const ok = await confirmDestructive({
      title: strings.leaveTitle,
      message: list.members.length <= 1 ? strings.leaveLastMessage : strings.leaveMessage,
      confirmLabel: strings.leaveList,
    });
    if (ok) await onLeave(list.id);
  };

  const remove = async () => {
    if (!list) return;
    close();
    const ok = await confirmDestructive({
      title: strings.deleteTitle,
      message: withCount(strings.deleteMessage, list.members.length),
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
                    if (l.id !== list?.id) haptic.select();
                    onSelect(l.id);
                    close();
                  }}
                >
                  <span className="row__name">{l.name}</span>
                  <span className="row__meta">
                    {l.id === list?.id ? "✓" : withCount(strings.membersCount, l.members.length)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <ul className="rows">
            <li>
              <button type="button" className="row row--accent" onClick={() => open("create", "switcher")}>
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
              <button type="button" className="row" onClick={() => open("rename", "menu")}>
                {strings.renameList}
              </button>
            </li>
            <li>
              <button type="button" className="row row--destructive" onClick={() => void leave()}>
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
          onClose={back}
          onDone={close}
          onSubmit={onCreate}
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
          onClose={back}
          onDone={close}
          onSubmit={(name) => onRename(list.id, name)}
        />
      )}
    </>
  );

  if (!list) {
    return (
      <main className="screen">
        <section className="empty">
          <p className="empty__title">{strings.noList}</p>
          <button type="button" className="empty__action" onClick={() => open("create")}>
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
        <h1 className="header__heading">
          <button
            type="button"
            className="header__switch"
            aria-haspopup="dialog"
            onClick={() => open("switcher")}
          >
            <span className="header__title">{list.name}</span>
            <span className="header__chevron" aria-hidden="true">
              ▾
            </span>
          </button>
        </h1>
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
          className="header__menu"
          aria-label={strings.listMenu}
          onClick={() => open("menu")}
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
