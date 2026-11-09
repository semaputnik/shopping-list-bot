import {
  bindThemeParamsCssVars,
  bindViewportCssVars,
  disableVerticalSwipes,
  expandViewport,
  hapticFeedbackNotificationOccurred,
  hapticFeedbackSelectionChanged,
  hideBackButton,
  init,
  isBackButtonMounted,
  isMainButtonMounted,
  isMiniAppActive,
  isTMA,
  miniAppReady,
  mountBackButton,
  mountMainButton,
  mountMiniApp,
  mountSwipeBehavior,
  mountThemeParamsSync,
  mountViewport,
  offBackButtonClick,
  offMainButtonClick,
  onBackButtonClick,
  onMainButtonClick,
  openPopup,
  openTelegramLink,
  retrieveLaunchParams,
  retrieveRawInitData,
  setMainButtonParams,
  setMiniAppBackgroundColor,
  setMiniAppBottomBarColor,
  setMiniAppHeaderColor,
  showBackButton,
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

/** How long an SDK mount may hold up start-up before the app carries on without it. */
const MOUNT_TIMEOUT_MS = 1500;

/**
 * Runs an async SDK mount but never lets it block start-up: some clients (seen on Telegram
 * Desktop for macOS) never answer the request a mount waits for, which used to leave the app
 * on the loading screen forever. Resolves true if the mount finished in time.
 */
async function mountWithin(mount: () => Promise<unknown>, what: string): Promise<boolean> {
  let timer: number | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = window.setTimeout(() => resolve(false), MOUNT_TIMEOUT_MS);
  });
  try {
    const done = await Promise.race([mount().then(() => true as const), timeout]);
    if (!done) console.warn(`Telegram ${what} mount timed out; continuing without it`);
    return done;
  } catch (e) {
    console.warn(`Telegram ${what} mount failed; continuing without it`, e);
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function doStartTelegram(): Promise<TelegramContext | null> {
  if (!isTMA()) return null;
  init();

  // Colors come only from themeParams, exposed as --tg-theme-* CSS variables.
  if (mountThemeParamsSync.isAvailable()) mountThemeParamsSync();
  if (bindThemeParamsCssVars.isAvailable()) bindThemeParamsCssVars();

  // ready() first: Telegram keeps its own loading placeholder up until it is called.
  if (miniAppReady.isAvailable()) miniAppReady();
  if (expandViewport.isAvailable()) expandViewport();

  // Both mounts are bounded and run in parallel, so a silent client costs at most
  // MOUNT_TIMEOUT_MS instead of hanging.
  const [miniAppMounted, viewportMounted] = await Promise.all([
    mountMiniApp.isAvailable() ? mountWithin(() => mountMiniApp(), "miniApp") : false,
    mountViewport.isAvailable() ? mountWithin(() => mountViewport(), "viewport") : false,
  ]);
  if (miniAppMounted) {
    // The page ground is secondary_bg_color; match Telegram's own chrome to it (no seam).
    if (setMiniAppHeaderColor.isAvailable()) setMiniAppHeaderColor("secondary_bg_color");
    if (setMiniAppBackgroundColor.isAvailable()) setMiniAppBackgroundColor("secondary_bg_color");
    if (setMiniAppBottomBarColor.isAvailable()) setMiniAppBottomBarColor("secondary_bg_color");
  }
  if (viewportMounted && bindViewportCssVars.isAvailable()) bindViewportCssVars();

  // Mounted once here: show/hide/onClick are only available on a mounted BackButton.
  if (mountBackButton.isAvailable() && !isBackButtonMounted()) mountBackButton();

  // The native bottom button («Куплено (N)»); shown and hidden through bindMainButton.
  if (mountMainButton.isAvailable() && !isMainButtonMounted()) mountMainButton();

  // Swipes on list rows must not close the app.
  if (mountSwipeBehavior.isAvailable()) mountSwipeBehavior();
  if (disableVerticalSwipes.isAvailable()) disableVerticalSwipes();

  const rawInitData = retrieveRawInitData();
  if (!rawInitData) return null;
  const user = retrieveLaunchParams().tgWebAppData?.user;
  return { rawInitData, languageCode: user?.language_code ?? null };
}

/**
 * Native confirmation (Telegram's showConfirm). Resolves true only when the destructive
 * button is pressed. Outside Telegram (local dev) it falls back to window.confirm.
 */
export async function confirmDestructive(opts: {
  title: string;
  message: string;
  confirmLabel: string;
}): Promise<boolean> {
  if (openPopup.isAvailable()) {
    const id = await openPopup({
      title: opts.title,
      message: opts.message,
      buttons: [
        { id: "confirm", type: "destructive", text: opts.confirmLabel },
        { type: "cancel" },
      ],
    });
    return id === "confirm";
  }
  return window.confirm(`${opts.title}\n\n${opts.message}`);
}

/**
 * Shows Telegram's native BackButton and calls `onBack` when it is pressed. Returns a
 * cleanup that removes the listener and hides the button. Used by every sheet and nested
 * screen, so the BackButton, not the «Закрыть» button, dismisses them. No-op outside Telegram.
 */
export function bindBackButton(onBack: () => void): () => void {
  if (!showBackButton.isAvailable() || !onBackButtonClick.isAvailable()) return () => {};
  onBackButtonClick(onBack);
  showBackButton();
  return () => {
    if (offBackButtonClick.isAvailable()) offBackButtonClick(onBack);
    if (hideBackButton.isAvailable()) hideBackButton();
  };
}

/**
 * Shows Telegram's native MainButton with `text` and calls `onClick` when it is pressed. Returns
 * a cleanup that removes the listener and hides the button. No-op outside Telegram.
 */
export function bindMainButton(text: string, onClick: () => void): () => void {
  if (!setMainButtonParams.isAvailable() || !onMainButtonClick.isAvailable()) return () => {};
  setMainButtonParams({ text, isVisible: true, isEnabled: true });
  onMainButtonClick(onClick);
  return () => {
    if (offMainButtonClick.isAvailable()) offMainButtonClick(onClick);
    if (setMainButtonParams.isAvailable()) setMainButtonParams({ isVisible: false });
  };
}

/** Changes the label of the MainButton in place (no hide/show, so it does not flicker). */
export function setMainButtonText(text: string): void {
  if (setMainButtonParams.isAvailable()) setMainButtonParams({ text });
}

/** Haptics on state changes (no-ops outside Telegram or on clients without support). */
export const haptic = {
  success() {
    if (hapticFeedbackNotificationOccurred.isAvailable()) hapticFeedbackNotificationOccurred("success");
  },
  error() {
    if (hapticFeedbackNotificationOccurred.isAvailable()) hapticFeedbackNotificationOccurred("error");
  },
  select() {
    if (hapticFeedbackSelectionChanged.isAvailable()) hapticFeedbackSelectionChanged();
  },
};

/**
 * Calls `callback` when the Mini App comes back to the foreground: Telegram's `activated`
 * event (through the Mini App's active signal) and the page becoming visible again.
 * Returns a function that stops listening.
 */
export function onActivated(callback: () => void): () => void {
  const onVisible = () => {
    if (document.visibilityState === "visible") callback();
  };
  document.addEventListener("visibilitychange", onVisible);
  let offSignal: (() => void) | undefined;
  try {
    offSignal = isMiniAppActive.sub((active: boolean) => {
      if (active) callback();
    });
  } catch {
    // Outside Telegram (or before init) there is no signal; visibilitychange still works.
  }
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    offSignal?.();
  };
}

/**
 * Opens Telegram's own "share to chat" picker for a link. Returns false outside Telegram (or on a
 * client without openTelegramLink), so the caller can fall back to copying.
 */
export function shareToChat(url: string, text: string): boolean {
  if (!openTelegramLink.isAvailable()) return false;
  openTelegramLink(
    `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  );
  return true;
}
