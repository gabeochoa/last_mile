// Pure grid transition: all of the game's move/collect/completion rules with no
// React. Grid.tsx drives its UI from this; tests exercise it deterministically.
import {
  COLS,
  ROWS,
  START,
  idx,
  genLayout,
  type Layout,
} from "./gridLogic";
import {
  CASH_PER_STOP,
  ROUTE_BONUS,
  SPECIAL_BONUS,
  FULL_COVERAGE_BONUS,
} from "./config";

export type GridState = {
  player: { x: number; y: number };
  layout: Layout;
  visited: Set<number>;
  collected: Set<number>;
  routes: number;
  fullBonusPaid: boolean;
};

// fresh route: player at depot, nothing collected, new random layout
export function newRoute(
  packageCount: number,
  routes = 0,
  rng: () => number = Math.random,
): GridState {
  return {
    player: { x: 0, y: 0 },
    layout: genLayout(packageCount, rng),
    visited: new Set([START]),
    collected: new Set(),
    routes,
    fullBonusPaid: false,
  };
}

// armed once every package is collected — driving back to the depot then finishes
const isArmed = (s: GridState) =>
  s.layout.specials.size > 0 && s.collected.size === s.layout.specials.size;

type MoveOpts = {
  autoDeliver: boolean;
  cashMult: number;
  packageCount: number;
  rng?: () => number;
};

// one grid move in (dx,dy). Off-grid/blocked = no-op. Armed + depot completes the
// route (returns a fresh route with routes+1). Otherwise advances a cell, paying
// movement income, the one-time full-coverage bonus, and (if autoDeliver) any
// package driven over.
export function applyMove(
  state: GridState,
  dx: number,
  dy: number,
  opts: MoveOpts,
): { state: GridState; earned: number } {
  const { autoDeliver, cashMult, packageCount, rng } = opts;
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  if (
    nx < 0 ||
    nx >= COLS ||
    ny < 0 ||
    ny >= ROWS ||
    state.layout.blocked.has(idx(nx, ny))
  ) {
    return { state, earned: 0 };
  }
  const cellIdx = idx(nx, ny);

  if (isArmed(state) && cellIdx === START) {
    return {
      state: newRoute(packageCount, state.routes + 1, rng),
      earned: Math.round(ROUTE_BONUS * cashMult),
    };
  }

  let earned = 0;
  if (!state.visited.has(cellIdx)) earned += Math.round(CASH_PER_STOP * cashMult);
  const visited = new Set(state.visited).add(cellIdx);

  let fullBonusPaid = state.fullBonusPaid;
  const total = COLS * ROWS - state.layout.blocked.size;
  if (!fullBonusPaid && visited.size === total) {
    fullBonusPaid = true;
    earned += Math.round(FULL_COVERAGE_BONUS * cashMult);
  }

  let collected = state.collected;
  if (autoDeliver && state.layout.specials.has(cellIdx) && !collected.has(cellIdx)) {
    earned += Math.round(SPECIAL_BONUS * cashMult);
    collected = new Set(state.collected).add(cellIdx);
  }

  return {
    state: { ...state, player: { x: nx, y: ny }, visited, collected, fullBonusPaid },
    earned,
  };
}

// Space action: collect an uncollected package underfoot (arms completion), else no-op.
export function collectHere(
  state: GridState,
  opts: { cashMult: number },
): { state: GridState; earned: number } {
  const cellIdx = idx(state.player.x, state.player.y);
  if (!state.layout.specials.has(cellIdx) || state.collected.has(cellIdx)) {
    return { state, earned: 0 };
  }
  return {
    state: { ...state, collected: new Set(state.collected).add(cellIdx) },
    earned: Math.round(SPECIAL_BONUS * opts.cashMult),
  };
}
