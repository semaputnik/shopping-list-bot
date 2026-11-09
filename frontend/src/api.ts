export interface User {
  id: number;
  telegram_id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
  language_code: string | null;
  language: "ru" | "es";
  /** True when the user overrode Telegram's language in Settings. */
  language_overridden: boolean;
}

/** A Member of a List, as the backend exposes it (no Telegram id). */
export interface Member {
  id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
}

/** A List in GLOSSARY.md terms (named ShoppingList to avoid clashing with the TS/DOM List names). */
export interface ShoppingList {
  id: number;
  name: string;
  member_count: number;
  share_code: string;
  /** The Share link; null while the backend has no SL_BOT_USERNAME. */
  share_url: string | null;
  members: Member[];
  version: number;
  updated_at: string;
}

export interface AuthResult {
  token: string;
  expires_at: number;
  user: User;
  start_param: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // Every command carries a client-generated id, so the server runs a replay only once.
  const isCommand = Boolean(init.method) && init.method !== "GET" && path !== "/api/auth";
  if (isCommand) headers.set("Idempotency-Key", crypto.randomUUID());
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch (error) {
    if (!isCommand) throw error;
    // The network dropped, so the command may or may not have run. Send it once more with the
    // same Idempotency-Key: the server runs it only once and returns the stored answer.
    response = await fetch(path, { ...init, headers });
  }
  if (!response.ok) {
    throw new ApiError(`${init.method ?? "GET"} ${path}: ${response.status}`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Sends the raw, signed initData; the backend verifies it. initDataUnsafe is never used. */
export function authenticate(initData: string): Promise<AuthResult> {
  return request<AuthResult>("/api/auth", {
    method: "POST",
    body: JSON.stringify({ init_data: initData }),
  });
}

/** Sets the interface language; null goes back to following Telegram's language. */
export function updateLanguage(token: string, language: "ru" | "es" | null): Promise<User> {
  return request<User>("/api/me", { method: "PATCH", body: JSON.stringify({ language }) }, token);
}

/** The user's Lists, most recently changed first. */
export function fetchLists(token: string): Promise<ShoppingList[]> {
  return request<ShoppingList[]>("/api/lists", {}, token);
}

export function createList(token: string, name: string): Promise<ShoppingList> {
  return request<ShoppingList>(
    "/api/lists",
    { method: "POST", body: JSON.stringify({ name }) },
    token,
  );
}

export interface Entry {
  id: number;
  product_id: number;
  name: string;
  note: string | null;
  category: string;
  added_by: number | null;
  /** First name of whoever added it; null if that user is gone. */
  added_by_name: string | null;
  created_at: string;
  checked: boolean;
  checked_by: number | null;
}

export interface CategoryGroup {
  key: string;
  emoji: string;
  name: string;
  count: number;
  entries: Entry[];
}

export interface ListContents {
  list: ShoppingList;
  /** Only non-empty groups, in the fixed system order. */
  categories: CategoryGroup[];
}

/** What happened to a List since a version: the missed bumps, or a snapshot if too far behind. */
export interface Changes {
  version: number;
  changes: { version: number; kind: string; entry_id: number | null }[];
  snapshot: ListContents | null;
}

/** Catch-up after the app was backgrounded or the stream dropped. */
export function fetchChanges(token: string, listId: number, since: number): Promise<Changes> {
  return request<Changes>(`/api/lists/${listId}/changes?since=${since}`, {}, token);
}

export interface AddEntriesResult {
  version: number;
  entries: Entry[];
}

export function fetchContents(token: string, listId: number): Promise<ListContents> {
  return request<ListContents>(`/api/lists/${listId}/entries`, {}, token);
}

/** Sends the raw input line; the backend parses, splits, files and creates the Entries. */
export function addEntries(
  token: string,
  listId: number,
  text: string,
  clientId: string,
): Promise<AddEntriesResult> {
  return request<AddEntriesResult>(
    `/api/lists/${listId}/entries`,
    { method: "POST", body: JSON.stringify({ text, client_id: clientId }) },
    token,
  );
}

export interface Category {
  key: string;
  name: string;
  emoji: string;
}

/** The system Categories, named in the user's language, in display order. */
export function fetchCategories(token: string): Promise<Category[]> {
  return request<Category[]>("/api/categories", {}, token);
}

/**
 * Edits one Entry; only the fields sent change. `note: null` clears the Note, `category` moves
 * the whole Product, `checked` is the wanted state (not a toggle).
 */
export function updateEntry(
  token: string,
  listId: number,
  entryId: number,
  change: { note?: string | null; category?: string; checked?: boolean },
): Promise<{ version: number; entry: Entry }> {
  return request(
    `/api/lists/${listId}/entries/${entryId}`,
    { method: "PATCH", body: JSON.stringify(change) },
    token,
  );
}


/** A Product from the List's memory matching the typed text. */
export interface Suggestion {
  product_id: number;
  name: string;
  category: string;
  /** The Product already has an Entry on the List (adding it again still creates another row). */
  on_list: boolean;
}

export function fetchSuggestions(token: string, listId: number, q: string): Promise<Suggestion[]> {
  return request<Suggestion[]>(`/api/lists/${listId}/suggestions?q=${encodeURIComponent(q)}`, {}, token);
}

/** Removes a Product from the List's memory; it is only hidden from suggestions. */
export function hideProduct(token: string, listId: number, productId: number): Promise<{ version: number }> {
  return request<{ version: number }>(`/api/lists/${listId}/products/${productId}`, { method: "DELETE" }, token);
}

export function renameList(token: string, id: number, name: string): Promise<ShoppingList> {
  return request<ShoppingList>(
    `/api/lists/${id}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
    token,
  );
}

export function deleteEntry(token: string, listId: number, entryId: number): Promise<{ version: number }> {
  return request(`/api/lists/${listId}/entries/${entryId}`, { method: "DELETE" }, token);
}

/** Undo of a delete: the Entry comes back as it was (a Checked Entry is still Checked). */
export function restoreEntry(
  token: string,
  listId: number,
  entryId: number,
): Promise<{ version: number; entry: Entry }> {
  return request(`/api/lists/${listId}/entries/${entryId}/restore`, { method: "POST" }, token);
}

/** Leaves the List for this user only; the last Member leaving deletes it. */
export function leaveList(token: string, id: number): Promise<void> {
  return request<void>(`/api/lists/${id}/leave`, { method: "POST" }, token);
}

/** Deletes the List for all its Members. Always ask for confirmation first. */
export function deleteList(token: string, id: number): Promise<void> {
  return request<void>(`/api/lists/${id}`, { method: "DELETE" }, token);
}

/** Opens a Share link: joins the List (a no-op for a Member). Rejects with ApiError 404 for an invalid code. */
export function joinList(token: string, code: string): Promise<ShoppingList> {
  return request<ShoppingList>(
    "/api/lists/join",
    { method: "POST", body: JSON.stringify({ code }) },
    token,
  );
}

/** Sets the wanted Checked state of one Entry (idempotent; the Entry stays in place). */
export function setChecked(
  token: string,
  listId: number,
  entryId: number,
  checked: boolean,
): Promise<{ version: number; entry: Entry }> {
  return request(
    `/api/lists/${listId}/entries/${entryId}`,
    { method: "PATCH", body: JSON.stringify({ checked }) },
    token,
  );
}

/** The Purchase record «Куплено» creates (History reuses this shape). */
export interface Purchase {
  id: number;
  version: number;
  purchased_at: string;
  purchased_by: number | null;
  entries: { name: string; note: string | null }[];
  count: number;
}

/** «Куплено»: every Checked Entry leaves the List as one Purchase. */
export function buy(
  token: string,
  listId: number,
): Promise<Purchase> {
  return request(`/api/lists/${listId}/purchases`, { method: "POST" }, token);
}

/** Undo of «Куплено»: the Entries return Checked and the Purchase disappears. */
export function undoPurchase(
  token: string,
  listId: number,
  purchaseId: number,
): Promise<{ version: number; restored: number }> {
  return request(`/api/lists/${listId}/purchases/${purchaseId}`, { method: "DELETE" }, token);
}

/** Unchecks every Entry of the List. */
export function uncheckAll(token: string, listId: number): Promise<{ version: number; unchecked: number }> {
  return request(`/api/lists/${listId}/entries/uncheck-all`, { method: "POST" }, token);
}

/** One past Purchase in the History: a snapshot of what was bought. */
export interface HistoryPurchase {
  id: number;
  purchased_at: string;
  purchased_by: number | null;
  /** First name of whoever pressed «Куплено»; null if that user is gone. */
  purchased_by_name: string | null;
  entries: { id: number; name: string; note: string | null }[];
}

export interface HistoryPage {
  purchases: HistoryPurchase[];
  /** Pass back as `cursor` for the next, older page; null on the last page. */
  next_cursor: string | null;
}

/** A page of the List's History, newest first. */
export function fetchHistory(
  token: string,
  listId: number,
  cursor: string | null,
  limit: number,
): Promise<HistoryPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return request<HistoryPage>(`/api/lists/${listId}/purchases?${params}`, {}, token);
}

/** Puts a past item back on the List, unchecked, with the same Note. */
export function readdFromHistory(
  token: string,
  listId: number,
  purchaseId: number,
  itemId: number,
  clientId: string,
): Promise<{ version: number; entries: Entry[] }> {
  return request(
    `/api/lists/${listId}/purchases/${purchaseId}/entries/${itemId}/readd`,
    { method: "POST", body: JSON.stringify({ client_id: clientId }) },
    token,
  );
}
