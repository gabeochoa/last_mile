// Game state. Everything counts DOWN toward the last mile.

export type GameState = {
  cash: number;
  tokens: number; // prestige currency
  quotaRemaining: number;
  delivered: number;
  day: number;
  daysUntilLastMile: number;
  humansRemaining: number;
  planetCoverage: number; // 0..1
  routeIndex: number;
  upgrades: Record<string, number>; // upgradeId -> level
  drivers: number;
  automationLevel: number;
  lastSaveTime: number;
};

export function createState(): GameState {
  return {
    cash: 0,
    tokens: 0,
    quotaRemaining: 10,
    delivered: 0,
    day: 1,
    daysUntilLastMile: 30,
    humansRemaining: 8_000_000_000,
    planetCoverage: 0,
    routeIndex: 0,
    upgrades: {},
    drivers: 0,
    automationLevel: 0,
    lastSaveTime: Date.now(),
  };
}
