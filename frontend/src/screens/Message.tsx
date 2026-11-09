interface Props {
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}

/** A centered full-screen state: loading, error, or "open in Telegram". */
export function Message({ title, hint, action }: Props) {
  return (
    <main className="message">
      <h1 className="message__title">{title}</h1>
      {hint && <p className="message__hint">{hint}</p>}
      {action && (
        <button type="button" className="message__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </main>
  );
}
