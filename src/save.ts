// Versioned localStorage persistence for meta progress (cash/upgrades/routes).
// Session-only otherwise: the in-progress route is NOT saved — it restarts fresh
// on reload; only meta carries over. No offline earnings.

export const SAVE_KEY = "lastmile.save.v1";

export type SaveData = {
  version: number;
  cash: number;
  upgrades: Record<string, number>;
  routes: number;
  // player's chosen accent color (hex); optional for older saves.
  accent?: string;
  // UI prefs (optional for older saves): shop "hide complete" + automation toggles.
  hideComplete?: boolean;
  autopilotOn?: boolean;
  autoStartOn?: boolean;
  autoBuyOn?: boolean;
  // lifetime count of rival stops you've poached — permanently discounts buyouts.
  takeover?: number;
  // per-upgrade Ops Manager auto-buy opt-in (id -> on). Unset = bucket default.
  autoBuySel?: Record<string, boolean>;
  // lifetime packages delivered (your stops + poached rival stops) — shown on the ending.
  totalDelivered?: number;
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
  const accent = typeof o.accent === "string" ? o.accent : undefined;
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  return {
    version: 1,
    cash: o.cash,
    upgrades: o.upgrades as Record<string, number>,
    routes: o.routes,
    accent,
    hideComplete: bool(o.hideComplete),
    autopilotOn: bool(o.autopilotOn),
    autoStartOn: bool(o.autoStartOn),
    autoBuyOn: bool(o.autoBuyOn),
    takeover: typeof o.takeover === "number" ? o.takeover : undefined,
    autoBuySel:
      typeof o.autoBuySel === "object" && o.autoBuySel !== null
        ? (o.autoBuySel as Record<string, boolean>)
        : undefined,
    totalDelivered: typeof o.totalDelivered === "number" ? o.totalDelivered : undefined,
  };
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

// Export the current save as a portable base64 code (for backup / moving devices).
export function exportSave(): string {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SAVE_KEY) : null;
  if (!raw) return "";
  try {
    return btoa(unescape(encodeURIComponent(raw)));
  } catch {
    return raw;
  }
}

// Import a code produced by exportSave (or raw save JSON). Validates before writing;
// returns true on success. Caller reloads to apply.
export function importSave(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  let json = trimmed;
  try {
    json = decodeURIComponent(escape(atob(trimmed)));
  } catch {
    // not base64 — maybe it's raw JSON already
  }
  const parsed = parseSave(json);
  if (!parsed) return false;
  if (typeof localStorage !== "undefined") localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
  return true;
}
