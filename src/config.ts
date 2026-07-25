// Static data tables + balance constants.

export type Upgrade = {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  costMultiplier: number;
  maxLevel: number;
  effect: number; // per-level magnitude; meaning depends on the upgrade
};

export type Route = {
  id: string;
  name: string;
  quota: number;
  payPerPackage: number;
};

export const STARTING_DAYS = 30;
export const BASE_QUOTA = 10;
export const QUOTA_GROWTH = 1.15; // each shift's quota grows by this factor
export const STARTING_HUMANS = 8_000_000_000;
export const DRIVER_RATE = 0.5; // packages/sec per hired driver (slower)
export const AUTO_RATE = 1.0; // packages/sec per self-driving level (faster)

export const UPGRADES: Upgrade[] = [
  {
    id: "vanSpeed",
    name: "Faster Vans",
    description: "Each level speeds up delivery rate.",
    baseCost: 10,
    costMultiplier: 1.15,
    maxLevel: 50,
    effect: 0.1,
  },
  {
    id: "vanCapacity",
    name: "Bigger Vans",
    description: "Each level carries more packages per trip.",
    baseCost: 25,
    costMultiplier: 1.2,
    maxLevel: 50,
    effect: 1,
  },
  {
    id: "selfDriving",
    name: "Self-Driving",
    description: "Each level raises automation.",
    baseCost: 500,
    costMultiplier: 1.5,
    maxLevel: 20,
    effect: 1,
  },
  {
    id: "hireDriver",
    name: "Hire Driver",
    description: "Each level adds a driver to the roster.",
    baseCost: 100,
    costMultiplier: 1.3,
    maxLevel: 100,
    effect: 1,
  },
];

export const ROUTES: Route[] = [
  { id: "downtown", name: "Downtown Loop", quota: 10, payPerPackage: 1 },
  { id: "suburbs", name: "Suburban Sprawl", quota: 40, payPerPackage: 2 },
];
