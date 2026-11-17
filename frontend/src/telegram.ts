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
  isThemeParamsDark,
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
  requestWriteAccess,
  retrieveLaunchParams,
  retrieveRawInitData,
  shareMessage,
  setMainButtonParams,
  setMiniAppBackgroundColor,
  setMiniAppBottomBarColor,
  setMiniAppHeaderColor,
  showBackButton,
} from "@telegram-apps/sdk-react";

/** Which grammar tgui renders: iOS-style on Apple clients, Android-style everywhere else. */
function launchPlatform(): "ios" | "base" {
  try {
    const platform = retrieveLaunchParams().tgWebAppPlatform;
    return platform === "ios" || platform === "macos" ? "ios" : "base";
  } catch {
    return "base"; // not inside Telegram
  }
}

export const platform = launchPlatform();

/**
 * Whether the Telegram theme is dark (a signal: it changes when the client switches theme).
 * Outside Telegram there is no theme, and the SDK would read that as dark.
 */
export const isDarkTheme = isThemeParamsDark;
export const insideTelegram = isTMA();

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

  // The mounts finish in the background: start-up (auth, the first List) never waits for them.
  // Each is bounded, so a silent client (Telegram Desktop for macOS) only means no chrome colours.
  void Promise.all([
    mountMiniApp.isAvailable() ? mountWithin(() => mountMiniApp(), "miniApp") : false,
    mountViewport.isAvailable() ? mountWithin(() => mountViewport(), "viewport") : false,
  ]).then(([miniAppMounted, viewportMounted]) => {
    if (miniAppMounted) {
      // The page ground is secondary_bg_color; match Telegram's own chrome to it (no seam).
      if (setMiniAppHeaderColor.isAvailable()) setMiniAppHeaderColor("secondary_bg_color");
      if (setMiniAppBackgroundColor.isAvailable()) setMiniAppBackgroundColor("secondary_bg_color");
      if (setMiniAppBottomBarColor.isAvailable()) setMiniAppBottomBarColor("secondary_bg_color");
    }
    if (viewportMounted && bindViewportCssVars.isAvailable()) bindViewportCssVars();
  });

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
  askForBotMessages(user?.allows_write_to_pm === true);
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

/**
 * Opens Telegram's share dialog for a bot-prepared message (the Invite card). Resolves "shared"
 * when it was sent or the user closed the dialog (nothing to fall back to), "unsupported" when
 * the client cannot do it, and rejects when Telegram refused the message.
 */
export async function shareCard(preparedId: string): Promise<"shared" | "unsupported"> {
  if (!shareMessage.isAvailable()) return "unsupported";
  try {
    await shareMessage(preparedId);
  } catch (error) {
    if (!String(error).includes("USER_DECLINED")) throw error;
  }
  return "shared";
}

const WRITE_ACCESS_ASKED = "shared-lists:write-access-asked";

/**
 * Bot notifications only reach people who let the bot write to them. Someone who opened the Mini
 * App without ever pressing /start has not, so ask once (Telegram's own prompt); never nag again.
 */
function askForBotMessages(alreadyAllowed: boolean): void {
  if (alreadyAllowed || !requestWriteAccess.isAvailable()) return;
  try {
    if (localStorage.getItem(WRITE_ACCESS_ASKED)) return;
    localStorage.setItem(WRITE_ACCESS_ASKED, "1");
  } catch {
    return; // no storage: better never to ask than to ask on every open
  }
  requestWriteAccess().catch((e: unknown) => console.warn("Write access request failed", e));
}
