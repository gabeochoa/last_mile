// Versioned localStorage persistence for meta progress (cash/upgrades/routes).
// Session-only otherwise: the in-progress route is NOT saved — it restarts fresh
// on reload; only meta carries over. No offline earnings.

export const SAVE_KEY = "lastmile.save.v1";

export type SaveData = {
  version: number;
  cash: number;
  upgrades: Record<string, number>;
  routes: number;
};

// Pure validator (testable in node): rejects junk, wrong shape, or old versions.
export function parseSave(json: string): SaveData | null {
  let d: unknown;
  try {
    d = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof d !== "object" || d === null) return null;
  const o = d as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (typeof o.cash !== "number") return null;
  if (typeof o.routes !== "number") return null;
  if (typeof o.upgrades !== "object" || o.upgrades === null) return null;
  return { version: 1, cash: o.cash, upgrades: o.upgrades as Record<string, number>, routes: o.routes };
}

export function save(data: SaveData): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function load(): SaveData | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(SAVE_KEY);
  return raw === null ? null : parseSave(raw);
}

export function clearSave(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SAVE_KEY);
}
