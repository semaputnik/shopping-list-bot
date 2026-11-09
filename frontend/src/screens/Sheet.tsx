import { useEffect, useRef, useState, type ReactNode } from "react";
import { bindBackButton } from "../telegram";

interface SheetProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A bottom sheet over a dimmed backdrop; tapping the backdrop closes it. While it is open
 * Telegram's BackButton is shown and calls `onClose` (which may return to a parent sheet).
 */
export function Sheet({ title, closeLabel, onClose, children }: SheetProps) {
  useEffect(() => bindBackButton(onClose), [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="sheet__title">{title}</h2>
        {children}
        <button type="button" className="sheet__cancel" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
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
        <label className="field">
          <span className="field__label">{label}</span>
          <input
            className="field__input"
            value={name}
            maxLength={200}
            placeholder={placeholder}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" className="sheet__submit" disabled={!trimmed || busy}>
          {submitLabel}
        </button>
      </form>
    </Sheet>
  );
}
