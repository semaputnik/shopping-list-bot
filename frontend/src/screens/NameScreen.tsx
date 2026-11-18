import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Title } from "@telegram-apps/telegram-ui";
import { Field } from "../components/Field";
import { bindBackButton, bindMainButton, hasMainButton, setMainButtonState } from "../telegram";

interface Props {
  title: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  cancelLabel: string;
  initial: string;
  /** Cancel or the BackButton. */
  onClose: () => void;
  /** Called after a successful submit, unless the screen was left meanwhile. */
  onDone: () => void;
  /** Resolves true when the request succeeded. On false, or a message to show under the field,
   * the screen stays with the text. */
  onSubmit: (name: string) => Promise<boolean | string>;
}

/**
 * A screen with one text field: name a new List or Store, or rename one. Wishapp's pattern: a page
 * (never a drawer, DESIGN.md), a labelled native field, saved with Telegram's MainButton (with its
 * own progress) and left with the BackButton. Outside Telegram the buttons are drawn on the page.
 */
export function NameScreen({
  title,
  label,
  placeholder,
  submitLabel,
  cancelLabel,
  initial,
  onClose,
  onDone,
  onSubmit,
}: Props) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const submit = useCallback(() => {
    if (!trimmed || busy) return;
    setBusy(true);
    void onSubmit(trimmed).then((result) => {
      if (!alive.current) return;
      if (result === true) return onDone();
      setBusy(false);
      setError(typeof result === "string" ? result : null);
    });
  }, [trimmed, busy, onSubmit, onDone]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => bindBackButton(() => onCloseRef.current()), []);

  // The MainButton is bound once; the ref keeps it calling the latest submit.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const native = hasMainButton();
  useEffect(
    () => (native ? bindMainButton(submitLabel, () => submitRef.current()) : undefined),
    [native, submitLabel],
  );
  useEffect(() => {
    if (native) setMainButtonState({ enabled: trimmed !== "" && !busy, loading: busy });
  }, [native, trimmed, busy]);

  return (
    <main className="screen">
      <Title level="1" weight="1" className="screen__title">
        {title}
      </Title>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field label={label} hint={error ?? undefined} error={error !== null}>
          <input
            className="field__control"
            type="text"
            value={name}
            maxLength={200}
            placeholder={placeholder}
            enterKeyHint="done"
            autoFocus
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </Field>
        {!native && (
          <div className="name-screen__actions">
            <Button type="submit" mode="filled" size="l" stretched disabled={!trimmed || busy}>
              {submitLabel}
            </Button>
            <Button type="button" mode="bezeled" size="l" stretched onClick={onClose}>
              {cancelLabel}
            </Button>
          </div>
        )}
      </form>
    </main>
  );
}
