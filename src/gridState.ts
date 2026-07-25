// Pure grid transition: all of the game's move/collect/completion rules with no
// React. Grid.tsx drives its UI from this; tests exercise it deterministically.
import {
  START,
  idx,
  genLayout,
  type Layout,
} from "./gridLogic";
import {
  ROUTE_BONUS,
  SPECIAL_BONUS,
} from "./config";

export type GridState = {
  player: { x: number; y: number };
  layout: Layout;
  visited: Set<number>;
  collected: Set<number>;
  routes: number;
  // true after a route completes: the day is over, awaiting startDay() to begin the next
  dayEnded: boolean;
};

// fresh route: player at depot, nothing collected, new random layout at cols×rows
export function newRoute(
  cols: number,
  rows: number,
  packageCount: number,
  routes = 0,
  rng: () => number = Math.random,
): GridState {
  return {
    player: { x: 0, y: 0 },
    layout: genLayout(cols, rows, packageCount, rng),
    visited: new Set([START]),
    collected: new Set(),
    routes,
    dayEnded: false,
  };
}

// Start the next day: a fresh route carrying the current routes count forward.
export function startDay(
  state: GridState,
  opts: { cols: number; rows: number; packageCount: number; rng?: () => number },
): GridState {
  return newRoute(opts.cols, opts.rows, opts.packageCount, state.routes, opts.rng);
}

// armed once every package is collected — driving back to the depot then finishes
const isArmed = (s: GridState) =>
  s.layout.specials.size > 0 && s.collected.size === s.layout.specials.size;

type MoveOpts = {
  autoDeliver: boolean;
  cashMult: number;
  packageCount: number;
  // dims for the NEXT route seeded on completion (buying expansion mid-run grows it)
  cols: number;
  rows: number;
  rng?: () => number;
};

// one grid move in (dx,dy). Off-grid/blocked = no-op. Armed + depot ENDS the day
// (same state, routes+1, dayEnded true, paying ROUTE_BONUS — startDay() begins the
// next route). Otherwise advances a cell (tracking coverage for the map% stat, no
// payout) and, if autoDeliver, collects any package driven over. Cash comes only
// from deliveries and finishing a route.
export function applyMove(
  state: GridState,
  dx: number,
  dy: number,
  opts: MoveOpts,
): { state: GridState; earned: number } {
  const { autoDeliver, cashMult } = opts;
  if (state.dayEnded) return { state, earned: 0 };
  const { cols: gcols, rows: grows } = state.layout;
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  if (
    nx < 0 ||
    nx >= gcols ||
    ny < 0 ||
    ny >= grows ||
    state.layout.blocked.has(idx(nx, ny, gcols))
  ) {
    return { state, earned: 0 };
  }
  const cellIdx = idx(nx, ny, gcols);

  if (isArmed(state) && cellIdx === START) {
    return {
      state: { ...state, routes: state.routes + 1, dayEnded: true },
      earned: Math.round(ROUTE_BONUS * cashMult),
    };
  }

  let earned = 0;
  const visited = new Set(state.visited).add(cellIdx); // coverage for map% stat only

  let collected = state.collected;
  if (autoDeliver && state.layout.specials.has(cellIdx) && !collected.has(cellIdx)) {
    earned += Math.round(SPECIAL_BONUS * cashMult);
    collected = new Set(state.collected).add(cellIdx);
  }

  return {
    state: { ...state, player: { x: nx, y: ny }, visited, collected },
    earned,
  };
}

// Collect an arbitrary cell (used by fleet vans): adds an uncollected special to
// `collected` + pays the bonus, else no-op.
export function collectAt(
  state: GridState,
  cellIdx: number,
  opts: { cashMult: number },
): { state: GridState; earned: number } {
  if (!state.layout.specials.has(cellIdx) || state.collected.has(cellIdx)) {
    return { state, earned: 0 };
  }
  return {
    state: { ...state, collected: new Set(state.collected).add(cellIdx) },
    earned: Math.round(SPECIAL_BONUS * opts.cashMult),
  };
}

// Space action: collect an uncollected package underfoot (arms completion), else no-op.
export function collectHere(
  state: GridState,
  opts: { cashMult: number },
): { state: GridState; earned: number } {
  const cellIdx = idx(state.player.x, state.player.y, state.layout.cols);
  if (!state.layout.specials.has(cellIdx) || state.collected.has(cellIdx)) {
    return { state, earned: 0 };
  }
  return {
    state: { ...state, collected: new Set(state.collected).add(cellIdx) },
    earned: Math.round(SPECIAL_BONUS * opts.cashMult),
  };
}
