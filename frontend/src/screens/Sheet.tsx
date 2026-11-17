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
  const drawerRef = useKeyboardAwareDrawer();
  return (
    <Modal
      ref={drawerRef}
      className="sheet-drawer"
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

/**
 * Keeps the drawer inside the part of the screen the keyboard leaves visible. tgui's drawer
 * (a vaul fork) lifts itself by the keyboard height but ignores `visualViewport.offsetTop`: when
 * iOS pans the page to show a focused field, the drawer ends up above the visible area, and a tall
 * one (the Entry card) is cut off at the top. The drawer's `bottom` and `max-height` are therefore
 * driven from the visual viewport here (applied with `!important` in styles.css over vaul's inline
 * values), and the focused field is scrolled into view inside the drawer.
 */
function useKeyboardAwareDrawer() {
  // A callback ref: tgui mounts the drawer into its portal a render later than the Sheet.
  const [drawer, setDrawer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || !drawer) return;
    const update = () => {
      const hidden = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      drawer.style.setProperty("--sheet-bottom", `${hidden}px`);
      drawer.style.setProperty("--sheet-visible-height", `${viewport.height}px`);
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && drawer.contains(focused)) {
        requestAnimationFrame(() => focused.scrollIntoView({ block: "nearest" }));
      }
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [drawer]);
  return setDrawer;
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
