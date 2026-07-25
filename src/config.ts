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

// Economy: cash comes from delivering a package and, once the Bulk Contracts
// upgrade is owned, a per-level bonus for finishing a day (0 by default).
export const ROUTE_BONUS = 25; // bonus per Bulk Contracts level
export const SPECIAL_BONUS = 1;

// Market-takeover math: each cleared route claims this much share.
export const SHARE_PER_ROUTE = 5;

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
  // hide this upgrade in the shop until the named upgrade is owned (level >= 1)
  requires?: string;
  // maxLevel is a fluctuating capacity, not true completion: keep the row visible and
  // just disable the button when full (never show MAX / hide it).
  softCap?: boolean;
};

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
      { id: "fleet", name: "Fleet Recruitment", effect: "hire a driver (van on the grid)", baseCost: 150, costMult: 1.7, maxLevel: 10 },
      { id: "autoStart", name: "Auto-Start Day", effect: "the next day begins on its own", baseCost: 500, costMult: 1, maxLevel: 1 },
      { id: "vanSpeed", name: "Faster Vans", effect: "vans drive faster", baseCost: 100, costMult: 1.5, maxLevel: 12, requires: "fleet" },
      { id: "daySpeed", name: "Faster Days", effect: "days start quicker", baseCost: 300, costMult: 1.5, maxLevel: 8 },
    ],
  },
  {
    name: "ECONOMY",
    items: [
      { id: "demand", name: "Demand Engine", effect: "more deliveries per day", baseCost: 5, costMult: 1.2, softCap: true },
      { id: "routeOpt", name: "Better Rates", effect: "+$1 per delivery", baseCost: 60, costMult: 1.5, maxLevel: 15 },
      { id: "dayBonus", name: "Bulk Contracts", effect: "cash bonus for finishing a day", baseCost: 50, costMult: 1.4, maxLevel: 15 },
      { id: "surge", name: "Surge Pricing", effect: "×1.5 delivery pay per level", baseCost: 1000, costMult: 1.5, maxLevel: 20 },
    ],
  },
  {
    name: "TERRITORY",
    items: [
      { id: "expand", name: "Map Expansion", effect: "claim a street — grows your market share", baseCost: 40, costMult: 1.2, maxLevel: 20 },
      { id: "buyout", name: "Buy Out Rivals", effect: "one fewer rival delivery point on the map", baseCost: 2500, costMult: 1.6, maxLevel: 6 },
      { id: "depots", name: "Depots", effect: "another warehouse to dispatch from", baseCost: 200, costMult: 1.5, maxLevel: 8 },
    ],
  },
];

// Effect helpers: translate owned upgrade levels into gameplay numbers.
export const BASE_PACKAGES = 4;
export function extraPackages(u: Record<string, number>) {
  return u.demand ?? 0;
}
// Surge Pricing multiplies the per-delivery payout ×1.5 per level (late-game sink).
export const SURGE_MULT = 1.5;
export function perDelivery(u: Record<string, number>) {
  return Math.round((SPECIAL_BONUS + (u.routeOpt ?? 0)) * SURGE_MULT ** (u.surge ?? 0));
}
// Bulk Contracts -> cash bonus for finishing a day (0 until owned, +ROUTE_BONUS/level).
export function routeBonus(u: Record<string, number>) {
  return (u.dayBonus ?? 0) * ROUTE_BONUS;
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
// Owning the market IS fully expanding the map: each Map Expansion level claims
// an equal slice, so unowned share counts down to 0 at full expansion.
export const EXPAND_MAX =
  BUCKETS.flatMap((b) => b.items).find((i) => i.id === "expand")?.maxLevel ?? 20;
export function unownedShare(u: Record<string, number>): number {
  return Math.max(0, Math.round(100 * (1 - expandLevel(u) / EXPAND_MAX)));
}
