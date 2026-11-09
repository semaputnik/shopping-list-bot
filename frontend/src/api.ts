export interface User {
  id: number;
  telegram_id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
  language_code: string | null;
  language: "ru" | "es";
}

/** A List in GLOSSARY.md terms (named ShoppingList to avoid clashing with the TS/DOM List names). */
export interface ShoppingList {
  id: number;
  name: string;
  member_count: number;
  share_code: string;
  version: number;
  updated_at: string;
}

export interface AuthResult {
  token: string;
  expires_at: number;
  user: User;
  start_param: string | null;
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status}`);
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

export function renameList(token: string, id: number, name: string): Promise<ShoppingList> {
  return request<ShoppingList>(
    `/api/lists/${id}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
    token,
  );
}

/** Leaves the List for this user only; the last Member leaving deletes it. */
export function leaveList(token: string, id: number): Promise<void> {
  return request<void>(`/api/lists/${id}/leave`, { method: "POST" }, token);
}

/** Deletes the List for all its Members. Always ask for confirmation first. */
export function deleteList(token: string, id: number): Promise<void> {
  return request<void>(`/api/lists/${id}`, { method: "DELETE" }, token);
}
