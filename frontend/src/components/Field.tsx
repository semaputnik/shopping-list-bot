import type { ReactNode } from "react";

interface Props {
  label: string;
  /** A note under the control; shown in the destructive colour when `error` is set. */
  hint?: ReactNode;
  error?: boolean;
  /** The native control (input, textarea or select) with className "field__control". */
  children: ReactNode;
}

/**
 * A labelled form field, Wishapp's pattern: the label always visible above a native control,
 * a note below. tgui's Input hides its header on iOS, so forms use this instead; native controls
 * also keep the iOS caret and let the WebView scroll the focused field into view.
 */
export function Field({ label, hint, error, children }: Props) {
  return (
    <label className={error ? "field field--error" : "field"}>
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}
