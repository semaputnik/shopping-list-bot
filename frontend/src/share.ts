import { fetchInvite, prepareInvite } from "./api";
import { shareCard, shareToChat } from "./telegram";

/** Copies text to the clipboard; falls back to execCommand for webviews without the async API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/**
 * Shares a List invite: the bot's card through Telegram's share dialog; when that is unsupported
 * or fails, the plain link through the chat picker; and last, the link on the clipboard.
 */
export async function shareList(
  token: string,
  list: { id: number; name: string },
  text: string,
): Promise<"shared" | "copied" | "unavailable"> {
  try {
    const { id } = await prepareInvite(token, list.id);
    if ((await shareCard(id)) === "shared") return "shared";
  } catch {
    // The card is a nicety: the plain link below still works.
  }
  const url = (await fetchInvite(token, list.id).catch(() => null))?.url;
  if (!url) return "unavailable";
  if (shareToChat(url, text)) return "shared";
  return (await copyText(url)) ? "copied" : "unavailable";
}
