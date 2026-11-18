import { AppRoot } from "@telegram-apps/telegram-ui";
import type { ReactNode } from "react";
import { platform } from "../telegram";

/** tgui's root: iOS or Android grammar from the launch params, always the light palette. */
export function TelegramRoot({ children }: { children: ReactNode }) {
  return (
    <AppRoot platform={platform} appearance="light">
      {children}
    </AppRoot>
  );
}
