// Game simulation step. Called every frame with elapsed seconds.
import type { GameState } from "./state";
import { deliveryRate } from "./economy";

export function tick(state: GameState, dt: number): GameState {
  // TODO(phase2): auto-deliver deliveryRate(state) * dt packages.
  // TODO(phase2): decrement quotaRemaining by delivered packages.
  // TODO(phase2): when quotaRemaining <= 0, bank cash and advance the shift.
  // TODO(phase2): advance day, decrement daysUntilLastMile.
  // TODO(phase2): check ending (daysUntilLastMile <= 0 or planetCoverage >= 1).
  void deliveryRate;
  void dt;
  return state;
}
