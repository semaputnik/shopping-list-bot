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
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new ApiError(`${init.method ?? "GET"} ${path}: ${response.status}`, response.status);
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

export function fetchLists(token: string): Promise<ShoppingList[]> {
  return request<ShoppingList[]>("/api/lists", {}, token);
}

export interface Entry {
  id: number;
  product_id: number;
  name: string;
  note: string | null;
  category: string;
  added_by: number | null;
  created_at: string;
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

/** Opens a Share link: joins the List (a no-op for a Member). Rejects with ApiError 404 for an invalid code. */
export function joinList(token: string, code: string): Promise<ShoppingList> {
  return request<ShoppingList>(
    "/api/lists/join",
    { method: "POST", body: JSON.stringify({ code }) },
    token,
  );
}
