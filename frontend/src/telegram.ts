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
} from "@telegram-apps/sdk-react";

export interface TelegramContext {
  rawInitData: string;
  languageCode: string | null;
}

/**
 * Starts the Mini App: theme variables, ready(), expand(), disableVerticalSwipes().
 * Returns null when the page is not opened inside Telegram.
 */
export async function startTelegram(): Promise<TelegramContext | null> {
  if (!isTMA()) return null;
  init();

  // Colors come only from themeParams, exposed as --tg-theme-* CSS variables.
  if (mountThemeParamsSync.isAvailable()) mountThemeParamsSync();
  if (bindThemeParamsCssVars.isAvailable()) bindThemeParamsCssVars();

  if (mountMiniApp.isAvailable()) await mountMiniApp();
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
