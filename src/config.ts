// Single source of game tunables: economy, upgrade costs, share formula, shop.

// Economy (movement + route income), used by Grid.
export const CASH_PER_STOP = 1;
export const ROUTE_BONUS = 25;
export const SPECIAL_BONUS = 10;
export const FULL_COVERAGE_BONUS = 50; // one-time, for covering every reachable cell in a route

// Purchasable-upgrade costs, keyed by upgrade id (used by App's onBuy).
export const COSTS: Record<string, number> = { autoDeliver: 10 };

// Market-takeover math: each cleared route claims this much share.
export const SHARE_PER_ROUTE = 5;

// id set => real, purchasable upgrade. Only wired ids do anything; the rest
// stay visual (no id => BUY disabled) or LOCKED, as in the mock.
export type Upgrade = { name: string; effect: string; id?: string; cost?: number; locked?: boolean };
export const BUCKETS: { name: string; items: Upgrade[] }[] = [
  {
    name: "MOVEMENT",
    items: [
      { name: "Adaptive Steering", effect: "auto-turns at walls", cost: 45 },
    ],
  },
  {
    name: "AUTOMATION",
    items: [
      { name: "Auto-Deliver", effect: "packages auto-collect; no key press", id: "autoDeliver", cost: 10 },
      { name: "Autopilot Module", effect: "self-drives the route", locked: true },
      { name: "Fleet Recruitment", effect: "hire a driver (van on the grid)", locked: true },
    ],
  },
  {
    name: "ECONOMY",
    items: [
      { name: "Demand Engine", effect: "more orders -> more packages", cost: 30 },
      { name: "Route Optimization", effect: "+cash per delivery", cost: 60 },
    ],
  },
];
