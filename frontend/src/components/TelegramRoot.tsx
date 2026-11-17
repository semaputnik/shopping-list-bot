import { useSignal } from "@telegram-apps/sdk-react";
import { AppRoot } from "@telegram-apps/telegram-ui";
import type { ReactNode } from "react";
import { insideTelegram, isDarkTheme, platform } from "../telegram";

/** tgui's root: iOS or Android grammar from the launch params, light or dark from the live theme. */
export function TelegramRoot({ children }: { children: ReactNode }) {
  const dark = useSignal(isDarkTheme);
  return (
    <AppRoot platform={platform} appearance={insideTelegram && dark ? "dark" : "light"}>
      {children}
    </AppRoot>
  );
}
