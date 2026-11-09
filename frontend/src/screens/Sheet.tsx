import { useState, type ReactNode } from "react";

interface SheetProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

/** A bottom sheet over a dimmed backdrop; tapping the backdrop closes it. */
export function Sheet({ title, closeLabel, onClose, children }: SheetProps) {
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
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
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
  onSubmit,
}: NameSheetProps) {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  return (
    <Sheet title={title} closeLabel={cancelLabel} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) void onSubmit(trimmed);
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
        <button type="submit" className="sheet__submit" disabled={!trimmed}>
          {submitLabel}
        </button>
      </form>
    </Sheet>
  );
}
