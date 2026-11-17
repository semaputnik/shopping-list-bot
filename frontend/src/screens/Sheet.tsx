import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Input, List, Modal, Section } from "@telegram-apps/telegram-ui";
import { bindBackButton } from "../telegram";

interface SheetProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A tgui Modal drawer; tapping the backdrop or dragging it down closes it. While it is open
 * Telegram's BackButton is shown and calls `onClose` (which may return to a parent sheet).
 */
export function Sheet({ title, closeLabel, onClose, children }: SheetProps) {
  // Bind the native button once per Sheet; the ref keeps the latest onClose without re-binding
  // (off/hide/on/show) on every parent re-render, which would flicker the button.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => bindBackButton(() => onCloseRef.current()), []);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      header={<Modal.Header>{title}</Modal.Header>}
      aria-label={title}
    >
      <div className="sheet">
        {children}
        <Button mode="bezeled" size="l" stretched onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
    </Modal>
  );
}

interface NameSheetProps {
  title: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  cancelLabel: string;
  initial: string;
  /** Cancel / BackButton / backdrop. */
  onClose: () => void;
  /** Called after a successful submit, unless the sheet was dismissed meanwhile. */
  onDone: () => void;
  /** Resolves true when the request succeeded; on false the sheet stays open with the text. */
  onSubmit: (name: string) => Promise<boolean>;
}

/** A sheet with one text field, used to name a new List or rename an existing one. */
export function NameSheet({
  title,
  label,
  placeholder,
  submitLabel,
  cancelLabel,
  initial,
  onClose,
  onDone,
  onSubmit,
}: NameSheetProps) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  return (
    <Sheet title={title} closeLabel={cancelLabel} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmed || busy) return;
          setBusy(true);
          void onSubmit(trimmed).then((ok) => {
            if (!alive.current) return;
            if (ok) onDone();
            else setBusy(false);
          });
        }}
      >
        <List>
          <Section>
            <Input
              header={label}
              value={name}
              maxLength={200}
              placeholder={placeholder}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </Section>
        </List>
        <Button type="submit" mode="filled" size="l" stretched disabled={!trimmed || busy}>
          {submitLabel}
        </Button>
      </form>
    </Sheet>
  );
}
