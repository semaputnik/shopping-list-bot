/** One change to a List, as the server announces it on the event stream. */
export interface ChangeEvent {
  list_id: number;
  version: number;
  kind: string;
  entry_id: number | null;
}

/**
 * What App tells the List screen about the outside world: bump `seq` to signal something new.
 * An "event" is one change announced for `listId` at `version`; a "catchup" means the app came
 * back or the stream reconnected, so the screen must ask what it missed.
 */
export interface Remote {
  seq: number;
  kind: "event" | "catchup";
  listId: number | null;
  version: number;
}

interface Handlers {
  /** The stream is subscribed (also after a reconnect): catch up on what was missed. */
  onReady: () => void;
  onChange: (event: ChangeEvent) => void;
}

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 10000;
// The server sends a comment every 15 s; silence for this long means a dead connection.
const SILENCE_MS = 45000;

/**
 * Keeps the server-sent event stream (`GET /api/events`) open, reconnecting with backoff.
 * fetch is used instead of EventSource because the session token must go in a header, not a URL.
 * Returns a function that closes the stream for good.
 */
export function openEventStream(token: string, handlers: Handlers): () => void {
  let stopped = false;
  let controller: AbortController | undefined;
  let delay = RETRY_MIN_MS;

  const run = async () => {
    while (!stopped) {
      controller = new AbortController();
      const { signal } = controller;
      let watchdog = window.setTimeout(() => controller?.abort(), SILENCE_MS);
      try {
        const response = await fetch("/api/events", {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal,
        });
        if (response.status === 401) return; // the session is gone; nothing to reconnect to
        if (!response.ok || !response.body) throw new Error(`events: ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          window.clearTimeout(watchdog);
          watchdog = window.setTimeout(() => controller?.abort(), SILENCE_MS);
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            dispatch(frame);
          }
        }
      } catch (error) {
        if (!stopped) console.warn("event stream dropped", error);
      } finally {
        window.clearTimeout(watchdog);
      }
      if (stopped) return;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      delay = Math.min(delay * 2, RETRY_MAX_MS);
    }
  };

  const dispatch = (frame: string) => {
    let name = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (name === "ready") {
      delay = RETRY_MIN_MS; // a healthy connection resets the backoff
      handlers.onReady();
    } else if (name === "change" && data.length > 0) {
      try {
        handlers.onChange(JSON.parse(data.join("\n")) as ChangeEvent);
      } catch (error) {
        console.error(error);
      }
    }
  };

  void run();
  return () => {
    stopped = true;
    controller?.abort();
  };
}
