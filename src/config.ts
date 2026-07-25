// Single source of game tunables: economy, upgrade costs, share formula, shop.

// Economy (movement + route income), used by Grid.
export const CASH_PER_STOP = 1;
export const ROUTE_BONUS = 25;
export const SPECIAL_BONUS = 10;
export const FULL_COVERAGE_BONUS = 50; // one-time, for covering every reachable cell in a route

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

// Cost of the next level: baseCost grows by costMult per level already owned.
export function upgradeCost(u: Upgrade, level: number): number {
  return Math.floor((u.baseCost ?? 0) * (u.costMult ?? 1) ** level);
}

export const BUCKETS: { name: string; items: Upgrade[] }[] = [
  {
    name: "AUTOMATION",
    items: [
      { id: "autoDeliver", name: "Auto-Deliver", effect: "packages auto-collect; no key press", baseCost: 10, costMult: 1, maxLevel: 1 },
      { name: "Autopilot Module", effect: "self-drives the route", locked: true },
      { name: "Fleet Recruitment", effect: "hire a driver (van on the grid)", locked: true },
    ],
  },
  {
    name: "ECONOMY",
    items: [
      { id: "demand", name: "Demand Engine", effect: "more orders -> more packages", baseCost: 30, costMult: 1.6, maxLevel: 8 },
      { id: "routeOpt", name: "Route Optimization", effect: "+cash per delivery", baseCost: 60, costMult: 1.5, maxLevel: 15 },
    ],
  },
];

// Effect helpers: translate owned upgrade levels into gameplay numbers.
export const BASE_PACKAGES = 4;
export function extraPackages(u: Record<string, number>) {
  return u.demand ?? 0;
}
export function cashMult(u: Record<string, number>) {
  return 1 + (u.routeOpt ?? 0) * 0.25;
}
