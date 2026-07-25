// Persistence. Guards localStorage so tests (node) don't blow up.
import type { GameState } from "./state";

export const SAVE_KEY = "lastmile.save.v1";
const SAVE_VERSION = 1;

type SavedGame = GameState & { version: number };

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function save(state: GameState): void {
  if (!hasStorage()) return;
  const payload: SavedGame = { ...state, version: SAVE_VERSION };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

export function load(): GameState | null {
  if (!hasStorage()) return null;
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as SavedGame;
  // TODO(phase4): migrate older `version` payloads to the current shape.
  const { version: _version, ...state } = parsed;
  return state;
}

export function applyOfflineProgress(state: GameState, _now: number): GameState {
  // TODO(phase4): compute capped idle gains from (now - lastSaveTime).
  return state;
}
