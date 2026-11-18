import { useEffect, useState } from "react";
import { List, Placeholder, Section, Title } from "@telegram-apps/telegram-ui";
import { ApiError, type Store } from "../api";
import { ActionCell } from "../components/ActionCell";
import type { Strings } from "../i18n";
import { bindBackButton, confirmDestructive, haptic } from "../telegram";
import { NameSheet, Sheet } from "./Sheet";

interface Props {
  stores: Store[];
  strings: Strings;
  /** Each rejects on failure; a taken name is ApiError 409. */
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: number, name: string) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onBack: () => void;
}

type Open = null | { kind: "create" } | { kind: "actions" | "rename"; store: Store };

/** The List's Stores: add one, rename it, delete it (its Products stay, without a Store). */
export function StoresScreen({ stores, strings, onCreate, onRename, onDelete, onBack }: Props) {
  const [open, setOpen] = useState<Open>(null);
  // A sheet on top owns the BackButton; the screen takes it back once the sheet is gone.
  useEffect(() => (open ? undefined : bindBackButton(onBack)), [open, onBack]);

  const submit = async (run: () => Promise<unknown>): Promise<boolean | string> => {
    try {
      await run();
      haptic.success();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) return strings.storeTaken;
      console.error(e);
      haptic.error();
      return false;
    }
  };

  const remove = async (store: Store) => {
    setOpen(null);
    const ok = await confirmDestructive({
      title: strings.deleteStoreTitle.replace("{name}", store.name),
      message: strings.deleteStoreMessage,
      confirmLabel: strings.deleteStore,
    });
    if (!ok) return;
    try {
      await onDelete(store.id);
      haptic.success();
    } catch (e) {
      console.error(e);
      haptic.error();
    }
  };

  return (
    <main className="screen">
      <Title level="1" weight="1" className="screen__title">
        {strings.stores}
      </Title>
      {stores.length === 0 ? (
        <Placeholder header={strings.storesEmptyTitle} description={strings.storesEmptyHint}>
          <span className="placeholder__emoji" aria-hidden="true">
            🏪
          </span>
        </Placeholder>
      ) : (
        <List>
          <Section footer={strings.storesHint}>
            {stores.map((st) => (
              <ActionCell key={st.id} onClick={() => setOpen({ kind: "actions", store: st })}>
                {st.name}
              </ActionCell>
            ))}
          </Section>
        </List>
      )}
      <List>
        <Section>
          <ActionCell tone="accent" onClick={() => setOpen({ kind: "create" })}>
            ＋ {strings.newStore}
          </ActionCell>
        </Section>
      </List>

      {open?.kind === "actions" && (
        <Sheet title={open.store.name} closeLabel={strings.cancel} onClose={() => setOpen(null)}>
          <List>
            <Section>
              <ActionCell onClick={() => setOpen({ kind: "rename", store: open.store })}>
                {strings.renameStore}
              </ActionCell>
              <ActionCell tone="destructive" onClick={() => void remove(open.store)}>
                {strings.deleteStore}
              </ActionCell>
            </Section>
          </List>
        </Sheet>
      )}
      {open?.kind === "rename" && (
        <NameSheet
          title={strings.renameStore}
          label={strings.storeName}
          placeholder={strings.storeNamePlaceholder}
          submitLabel={strings.save}
          cancelLabel={strings.cancel}
          initial={open.store.name}
          onClose={() => setOpen(null)}
          onDone={() => setOpen(null)}
          onSubmit={(name) => submit(() => onRename(open.store.id, name))}
        />
      )}
      {open?.kind === "create" && (
        <NameSheet
          title={strings.newStore}
          label={strings.storeName}
          placeholder={strings.storeNamePlaceholder}
          submitLabel={strings.save}
          cancelLabel={strings.cancel}
          initial=""
          onClose={() => setOpen(null)}
          onDone={() => setOpen(null)}
          onSubmit={(name) => submit(() => onCreate(name))}
        />
      )}
    </main>
  );
}
