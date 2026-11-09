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
  return (await response.json()) as T;
}

/** Sends the raw, signed initData; the backend verifies it. initDataUnsafe is never used. */
export function authenticate(initData: string): Promise<AuthResult> {
  return request<AuthResult>("/api/auth", {
    method: "POST",
    body: JSON.stringify({ init_data: initData }),
  });
}

export function fetchLists(token: string): Promise<ShoppingList[]> {
  return request<ShoppingList[]>("/api/lists", {}, token);
}
