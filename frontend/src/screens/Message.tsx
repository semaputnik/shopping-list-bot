import { Button, Placeholder } from "@telegram-apps/telegram-ui";

interface Props {
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}

/** A centered full-screen state: loading, error, or "open in Telegram". */
export function Message({ title, hint, action }: Props) {
  return (
    <main className="message">
      <Placeholder
        header={title}
        description={hint}
        action={
          action && (
            <Button size="l" mode="filled" onClick={action.onClick}>
              {action.label}
            </Button>
          )
        }
      />
    </main>
  );
}
