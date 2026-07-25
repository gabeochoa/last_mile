// HUD render. Stub prints the key numbers as text.
import type { GameState } from "./state";

export function renderHUD(root: HTMLElement, state: GameState): void {
  // TODO(phase6): dispatch control-center layout — sidebar (drivers/orders),
  // main map area, top alert bar with the countdowns.
  root.innerHTML = `
    <div class="hud">
      <div>Day ${state.day} — ${state.daysUntilLastMile} days until the last mile</div>
      <div>Cash: ${state.cash} | Tokens: ${state.tokens}</div>
      <div>Delivered: ${state.delivered} | Quota left: ${state.quotaRemaining}</div>
      <div>Drivers: ${state.drivers} | Automation: ${state.automationLevel}</div>
      <div>Humans left: ${state.humansRemaining} | Coverage: ${(state.planetCoverage * 100).toFixed(1)}%</div>
    </div>
  `;
}
