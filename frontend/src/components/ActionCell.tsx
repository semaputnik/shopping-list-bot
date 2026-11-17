import type { ComponentProps } from "react";
import { Cell } from "@telegram-apps/telegram-ui";

type Props = Omit<ComponentProps<typeof Cell>, "Component"> & {
  /** Colours the label: the accent for a main action, red for a destructive one. */
  tone?: "accent" | "destructive";
};

/** A tgui Cell that is a button: one tappable row of a menu, a sheet or a list of choices. */
export function ActionCell({ tone, className, ...props }: Props) {
  const classes = ["cell-button", tone && `cell--${tone}`, className].filter(Boolean).join(" ");
  return <Cell Component="button" type="button" className={classes} {...props} />;
}
