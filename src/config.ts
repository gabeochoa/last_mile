// Single source of game tunables: economy, upgrade costs, share formula, shop.

// Economy: cash comes only from delivering a package and finishing a route.
export const ROUTE_BONUS = 25;
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
      { id: "fleet", name: "Fleet Recruitment", effect: "hire a driver (van on the grid)", baseCost: 150, costMult: 1.7, maxLevel: 5 },
      { id: "autoStart", name: "Auto-Start Day", effect: "the next day begins on its own", baseCost: 500, costMult: 1, maxLevel: 1 },
    ],
  },
  {
    name: "ECONOMY",
    items: [
      { id: "demand", name: "Demand Engine", effect: "more deliveries per day", baseCost: 30, costMult: 1.6 },
      { id: "routeOpt", name: "Better Rates", effect: "+$1 per delivery", baseCost: 60, costMult: 1.5, maxLevel: 15 },
    ],
  },
  {
    name: "TERRITORY",
    items: [
      { id: "expand", name: "Map Expansion", effect: "adds a street (row/column) to the map", baseCost: 40, costMult: 1.4, maxLevel: 20 },
      { id: "depots", name: "Depots", effect: "another warehouse to dispatch from", baseCost: 200, costMult: 1.5, maxLevel: 5 },
    ],
  },
];

// Effect helpers: translate owned upgrade levels into gameplay numbers.
export const BASE_PACKAGES = 4;
export function extraPackages(u: Record<string, number>) {
  return u.demand ?? 0;
}
export function perDelivery(u: Record<string, number>) {
  return SPECIAL_BONUS + (u.routeOpt ?? 0);
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
