/* Client for the shared database in ../data. Reads are answered by the dashboard's own dev server straight
   from that database; writes and live events go to the Grandma's Till server (see vite.config.ts).
   For a dashboard hosted on its own, set VITE_TILL_URL to the till's address. */

const BASE = (import.meta.env.VITE_TILL_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export type MenuItem = { id: string; name: string; cat: "Parfaits" | "Bakes" | "Drinks"; price: number; fresh: boolean };

/** One item on a sale: menu item id, quantity, unit price at the time of sale. */
export type SaleLine = { id: string; q: number; p: number };

export type Sale = {
  id: string;
  ts: number; // epoch ms, set by the server
  lines: SaleLine[];
  total: number;
  pay: "card" | "cash" | "pending";
  m: string | null; // member id
  src: "sim" | "till" | "kiosk" | "rush"; // sim = simulated history, the rest are real orders
  no: number | null; // order number, restarts each day
  name: string | null; // name to call out
  status: "new" | "ready" | "done";
};

export type Member = { id: string; num: number; name: string; joined: number; sample: 0 | 1 };

export type Health = { ok: boolean; store: "sqlite" | "json"; file: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body as T;
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<Health>("/api/health"),
  menu: () => request<MenuItem[]>("/api/menu"),

  /** Sales from `since` (epoch ms) on. `liveOnly` leaves out the simulated history. */
  sales: ({ since = 0, liveOnly = false }: { since?: number; liveOnly?: boolean } = {}) =>
    request<Sale[]>(`/api/sales?since=${since}${liveOnly ? "&src=live" : ""}`),

  /** The server looks up prices, stamps the time and numbers the order. */
  addSale: (sale: { lines: { id: string; q: number }[]; pay?: "card" | "cash" | "pending"; m?: string; name?: string }) =>
    request<Sale>("/api/sales", json("POST", sale)),

  updateSale: (id: string, change: { status?: Sale["status"]; pay?: "card" | "cash" }) =>
    request<Sale>(`/api/sales/${encodeURIComponent(id)}`, json("PATCH", change)),

  members: () => request<Member[]>("/api/members"),
  addMember: (name: string) => request<Member>("/api/members", json("POST", { name })),
};

/** Live updates from the till. Returns a function that stops listening. */
export function subscribe(handlers: {
  sale?: (s: Sale) => void;
  update?: (s: Sale) => void;
  member?: (m: Member) => void;
  clear?: (info: { removed: number }) => void;
}): () => void {
  const events = new EventSource(BASE + "/api/events");
  for (const [name, fn] of Object.entries(handlers)) {
    if (fn) events.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data)));
  }
  return () => events.close();
}
