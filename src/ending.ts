// End screen. Stub.
import type { GameState } from "./state";

export function showEnding(root: HTMLElement, _state: GameState): void {
  // TODO(phase7): render the ending based on how the run resolved.
  root.innerHTML = `<div class="ending">The last mile has been delivered.</div>`;
}
