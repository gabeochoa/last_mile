// Pure economy math. No DOM. No side effects.
import type { GameState } from "./state";
import type { Upgrade } from "./config";

export function upgradeCost(upgrade: Upgrade, _level: number): number {
  // TODO(phase1): baseCost * costMultiplier ^ level, rounded.
  return upgrade.baseCost;
}

export function canAfford(state: GameState, _upgradeId: string): boolean {
  // TODO(phase1): look up current level, compare upgradeCost to state.cash.
  return state.cash > 0;
}

export function buyUpgrade(state: GameState, _upgradeId: string): GameState {
  // TODO(phase1): if canAfford, deduct cost, bump upgrades[id] level.
  return state;
}

export function deliveryRate(state: GameState): number {
  // TODO(phase1): packages/sec from drivers + automationLevel + vanSpeed upgrade.
  return state.drivers + state.automationLevel;
}

export function prestige(state: GameState): GameState {
  // TODO(phase3): convert progress to tokens, reset run-scoped fields.
  return state;
}
