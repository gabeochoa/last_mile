// Single source of game tunables: economy, upgrade costs, share formula, shop.

// Player's brand color. DEFAULT_ACCENT is the original orange; ACCENT_CHOICES are the
// swatches offered at the start screen. Rivals are always blue, so blue is excluded.
export const DEFAULT_ACCENT = "#E8541E";
export const ACCENT_CHOICES = [
  "#E8541E", // orange (default)
  "#E5B72E", // amber
  "#3FB56B", // green
  "#C13FD6", // magenta
  "#E23E5C", // red
  "#2FB6B0", // teal
];

// Broad palette for rival companies. A new rival company appears every 10 map
// expansions, each in a distinct color drawn from here — never the player's color and
// never one too close to it.
export const RIVAL_PALETTE = [
  "#4C86E8", "#E5B72E", "#3FB56B", "#C13FD6", "#E23E5C", "#2FB6B0",
  "#7B61FF", "#F25CA2", "#9AE23E", "#3ED4E2", "#B5651D", "#8CA0B5",
  "#F0862E", "#5CE1C0", "#D65C7A", "#A0D63E", "#6C7BE8", "#E8C85C",
];
const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const colorDist = (a: string, b: string): number => {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};
// `count` rival company colors, excluding the player's accent and any color close to
// it (so rivals never blend into "you"). One company per 10 Map Expansion levels.
export function rivalColors(accent: string, count: number): string[] {
  const usable = RIVAL_PALETTE.filter((c) => colorDist(c, accent) > 90);
  const pool = usable.length ? usable : RIVAL_PALETTE;
  return Array.from({ length: Math.max(1, count) }, (_, i) => pool[i % pool.length]);
}
export function rivalCompanyCount(expandLvl: number): number {
  return Math.floor(expandLvl / 5) + 1;
}

// Economy: cash comes from delivering a package and, once the Bulk Contracts
// upgrade is owned, a per-level bonus for finishing a day (0 by default).
export const ROUTE_BONUS = 25; // bonus per Bulk Contracts level
export const SPECIAL_BONUS = 1;

// id set => real, purchasable upgrade. Only wired ids do anything; the rest
// stay visual (no id => BUY disabled) or LOCKED, as in the mock.
export type Upgrade = {
  id?: string;
  name: string;
  effect: string;
  baseCost?: number;
  costMult?: number;
  maxLevel?: number;
  locked?: boolean;
  // hide this upgrade in the shop until the named upgrade reaches requiresLevel (default 1)
  requires?: string;
  requiresLevel?: number;
  // ...or until ANY of these upgrades is owned (level >= 1)
  requiresAny?: string[];
  // maxLevel is a fluctuating capacity, not true completion: keep the row visible and
  // just disable the button when full (never show MAX / hide it).
  softCap?: boolean;
  // tooltip shown when a soft-capped upgrade is at its (fluctuating) cap
  capHint?: string;
};

// Compact number formatting for big values: 30000 -> "30k", 1_500_000 -> "1.5m".
export function fmtNum(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return `${n}`;
  const units: [number, string][] = [[1e9, "b"], [1e6, "m"], [1e3, "k"]];
  for (const [v, s] of units) {
    if (abs >= v) {
      const x = n / v;
      return `${x >= 100 ? Math.round(x) : x.toFixed(1).replace(/\.0$/, "")}${s}`;
    }
  }
  return `${n}`;
}

// Round to a clean step that scales with magnitude: 5 (<100), 10 (<1k), 50 (<10k), 100 (>=10k).
const niceStep = (n: number) => (n < 100 ? 5 : n < 1000 ? 10 : n < 10000 ? 50 : 100);
const roundNice = (n: number) => Math.round(n / niceStep(n)) * niceStep(n);

// Cost of the next level: baseCost grows by costMult per level already owned, then
// rounded to a nice number. Walk levels 0..level so the result stays strictly
// increasing (bump by one step if rounding collides with the previous level).
export function upgradeCost(u: Upgrade, level: number): number {
  const base = u.baseCost ?? 0;
  const mult = u.costMult ?? 1;
  let cost = -Infinity;
  for (let l = 0; l <= level; l++) {
    const rounded = roundNice(base * mult ** l);
    cost = rounded <= cost ? cost + niceStep(cost) : rounded;
  }
  return cost;
}

export const BUCKETS: { name: string; items: Upgrade[] }[] = [
  {
    name: "AUTOMATION",
    items: [
      { id: "autoDeliver", name: "Auto-Deliver", effect: "packages auto-collect; no key press", baseCost: 10, costMult: 1, maxLevel: 1 },
      { id: "autopilot", name: "Autopilot Module", effect: "self-drives — no input needed", baseCost: 250, costMult: 1, maxLevel: 1 },
      { id: "fleet", name: "Fleet Recruitment", effect: "hire a driver (van on the grid)", baseCost: 150, costMult: 1.7, maxLevel: 300, requires: "autoDeliver", requiresLevel: 1, softCap: true, capHint: "One van per column — expand your map for more." },
      { id: "autoStart", name: "Auto-Start Day", effect: "the next day begins on its own", baseCost: 500, costMult: 1, maxLevel: 1, requires: "autopilot", requiresLevel: 1 },
      { id: "autobuy", name: "Ops Manager", effect: "auto-buys your cheapest affordable upgrade", baseCost: 5000, costMult: 1, maxLevel: 1, requires: "buyout", requiresLevel: 1 },
      { id: "vanSpeed", name: "Faster Vans", effect: "you + your drivers move faster", baseCost: 100, costMult: 1.5, maxLevel: 30, requiresAny: ["autopilot", "fleet"] },
      { id: "daySpeed", name: "Faster Days", effect: "days start quicker", baseCost: 300, costMult: 1.5, maxLevel: 20, requires: "autoStart", requiresLevel: 1 },
    ],
  },
  {
    name: "ECONOMY",
    items: [
      { id: "demand", name: "Spread Flyers", effect: "more deliveries per day", baseCost: 5, costMult: 1.1, softCap: true },
      { id: "routeOpt", name: "Better Rates", effect: "+$1 per delivery", baseCost: 15, costMult: 1.3, maxLevel: 40 },
      { id: "dayBonus", name: "Completion Bonus", effect: "cash for completing the day's deliveries", baseCost: 50, costMult: 1.4, maxLevel: 1000, requires: "fleet", requiresLevel: 1 },
      { id: "surge", name: "Tips", effect: "customers tip your contract drivers", baseCost: 1000, costMult: 1.5, maxLevel: 50, requires: "contracts", requiresLevel: 1 },
      { id: "contracts", name: "Contracts", effect: "steady cash every second (−1 driver)", baseCost: 2000, costMult: 1.5, maxLevel: 20, requires: "autoStart", requiresLevel: 1, softCap: true, capHint: "Needs another driver — hire more Fleet." },
      { id: "contractBoost", name: "Corporate Accounts", effect: "each contract pays more", baseCost: 8000, costMult: 1.6, maxLevel: 20, requires: "contracts", requiresLevel: 1 },
    ],
  },
  {
    name: "TERRITORY",
    items: [
      { id: "expand", name: "Map Expansion", effect: "open new territory (mostly rival-held)", baseCost: 100, costMult: 1.12, maxLevel: 300, requiresAny: ["autopilot", "fleet"] },
      { id: "buyout", name: "Buy Out Rivals", effect: "claim rival streets — grows your market share", baseCost: 2500, costMult: 1.6, maxLevel: 6, requires: "expand", requiresLevel: 5 },
      { id: "depots", name: "Depots", effect: "another warehouse to dispatch from", baseCost: 200, costMult: 1.5, maxLevel: 30, requires: "buyout", requiresLevel: 1 },
    ],
  },
];

// Effect helpers: translate owned upgrade levels into gameplay numbers.
export const BASE_PACKAGES = 4;
export function extraPackages(u: Record<string, number>) {
  return u.demand ?? 0;
}
export const SURGE_MULT = 1.5;
export function perDelivery(u: Record<string, number>) {
  return SPECIAL_BONUS + (u.routeOpt ?? 0);
}
// Per-contract cash/sec: $25 base, +50%/Corporate Accounts level, ×1.5/Tips level.
export function contractPerDriver(u: Record<string, number>) {
  return 25 * (1 + (u.contractBoost ?? 0) * 0.5) * SURGE_MULT ** (u.surge ?? 0);
}
// Bulk Contracts -> cash bonus for finishing a day (0 until owned, +ROUTE_BONUS/level).
export function routeBonus(u: Record<string, number>) {
  return (u.dayBonus ?? 0) * ROUTE_BONUS;
}
// Contracts -> total passive cash per second (per-driver rate × number of contracts).
export function contractIncome(u: Record<string, number>) {
  return (u.contracts ?? 0) * contractPerDriver(u);
}
// Faster Vans -> speed factor for autopilot/fleet ticks (level 0 = 1.0, +0.5x/level).
export function vanSpeed(u: Record<string, number>) {
  return 1 + (u.vanSpeed ?? 0) * 0.5;
}
// Faster Days -> factor shortening the auto-start-day delay (level 0 = 1, +1/level).
export function daySpeed(u: Record<string, number>) {
  return 1 + (u.daySpeed ?? 0);
}
// Depots upgrade -> number of warehouses (START is always one).
export function depotCount(u: Record<string, number>) {
  return 1 + (u.depots ?? 0);
}
// Map Expansion level -> feed to sizeForExpansion for the current grid dims.
export function expandLevel(u: Record<string, number>) {
  return u.expand ?? 0;
}
export const EXPAND_MAX =
  BUCKETS.flatMap((b) => b.items).find((i) => i.id === "expand")?.maxLevel ?? 20;
export const BUYOUT_MAX =
  BUCKETS.flatMap((b) => b.items).find((i) => i.id === "buyout")?.maxLevel ?? 6;
// Planet-wide market share (NOT just the visible grid), as a float so it reads like
// 99.99%. You own: a starting sliver for showing up + a trickle per Spread Flyers +
// the bulk from expanding into the planet AND clearing its rivals. Starts ~99.99%
// unowned; hits 0% once fully expanded (EXPAND_MAX) and fully bought out (BUYOUT_MAX).
export function unownedShare(u: Record<string, number>): number {
  const reached = expandLevel(u) / EXPAND_MAX; // how much of the planet you've expanded into
  const claimed = (u.buyout ?? 0) / BUYOUT_MAX; // how much of it you've taken from rivals
  // flyers are only an early trickle — capped at ~1% so they can never reach 0% on their
  // own; the real countdown to 0 comes from expanding AND buying out (reached*claimed).
  const flyers = Math.min(1, 0.01 * (u.demand ?? 0));
  const owned = 0.01 + flyers + 100 * reached * claimed;
  return Math.max(0, 100 - owned);
}
