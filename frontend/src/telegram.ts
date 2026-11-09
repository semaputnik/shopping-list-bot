import {
  bindThemeParamsCssVars,
  bindViewportCssVars,
  disableVerticalSwipes,
  expandViewport,
  init,
  isTMA,
  miniAppReady,
  mountMiniApp,
  mountSwipeBehavior,
  mountThemeParamsSync,
  mountViewport,
  retrieveLaunchParams,
  retrieveRawInitData,
  setMiniAppBackgroundColor,
  setMiniAppBottomBarColor,
  setMiniAppHeaderColor,
} from "@telegram-apps/sdk-react";

export interface TelegramContext {
  rawInitData: string;
  languageCode: string | null;
}

let started: Promise<TelegramContext | null> | undefined;

/**
 * Starts the Mini App once per page load: theme variables, ready(), expand(),
 * disableVerticalSwipes(). The SDK binders throw if called twice (Retry, StrictMode),
 * so the promise is memoised and every caller shares it.
 * Resolves to null when the page is not opened inside Telegram.
 */
export function startTelegram(): Promise<TelegramContext | null> {
  started ??= doStartTelegram();
  return started;
}

async function doStartTelegram(): Promise<TelegramContext | null> {
  if (!isTMA()) return null;
  init();

  // Colors come only from themeParams, exposed as --tg-theme-* CSS variables.
  if (mountThemeParamsSync.isAvailable()) mountThemeParamsSync();
  if (bindThemeParamsCssVars.isAvailable()) bindThemeParamsCssVars();

  if (mountMiniApp.isAvailable()) await mountMiniApp();
  // The page ground is secondary_bg_color; match Telegram's own chrome to it (no seam).
  if (setMiniAppHeaderColor.isAvailable()) setMiniAppHeaderColor("secondary_bg_color");
  if (setMiniAppBackgroundColor.isAvailable()) setMiniAppBackgroundColor("secondary_bg_color");
  if (setMiniAppBottomBarColor.isAvailable()) setMiniAppBottomBarColor("secondary_bg_color");
  if (miniAppReady.isAvailable()) miniAppReady();

  if (mountViewport.isAvailable()) await mountViewport();
  if (bindViewportCssVars.isAvailable()) bindViewportCssVars();
  if (expandViewport.isAvailable()) expandViewport();

  // Swipes on list rows must not close the app.
  if (mountSwipeBehavior.isAvailable()) mountSwipeBehavior();
  if (disableVerticalSwipes.isAvailable()) disableVerticalSwipes();

  const rawInitData = retrieveRawInitData();
  if (!rawInitData) return null;
  const user = retrieveLaunchParams().tgWebAppData?.user;
  return { rawInitData, languageCode: user?.language_code ?? null };
}
