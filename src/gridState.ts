// Pure grid transition: all of the game's move/collect/completion rules with no
// React. Grid.tsx drives its UI from this; tests exercise it deterministically.
import {
  START,
  idx,
  genLayout,
  growLayout,
  remapIndices,
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
  depotCount = 1,
  routes = 0,
  rng: () => number = Math.random,
): GridState {
  return {
    player: { x: 0, y: 0 },
    layout: genLayout(cols, rows, packageCount, depotCount, rng),
    visited: new Set([START]),
    collected: new Set(),
    routes,
    dayEnded: false,
  };
}

// Start the next day: a fresh route carrying the current routes count forward.
export function startDay(
  state: GridState,
  opts: { cols: number; rows: number; packageCount: number; depotCount?: number; rng?: () => number },
): GridState {
  return newRoute(opts.cols, opts.rows, opts.packageCount, opts.depotCount ?? 1, state.routes, opts.rng);
}

// Grow the CURRENT route's map to newCols x newRows LIVE (mid-route). growLayout
// remaps blocked/specials + guarantees reachability; visited/collected are remapped
// to the same wider row-width so coverage/deliveries survive. player {x,y}, routes,
// and collected semantics are unchanged. Only ever grows (no-op if not bigger).
export function growState(state: GridState, newCols: number, newRows: number): GridState {
  const { cols: oldCols, rows: oldRows } = state.layout;
  if (newCols <= oldCols && newRows <= oldRows) return state;
  return {
    ...state,
    layout: growLayout(state.layout, newCols, newRows),
    visited: remapIndices(state.visited, oldCols, newCols),
    collected: remapIndices(state.collected, oldCols, newCols),
  };
}

// Add up to `n` new packages to the CURRENT route on eligible cells (open, not the
// depot, not already a package). Prefers UNVISITED cells; falls back to visited-
// eligible only when unvisited run out. Deterministic given `rng`; adds fewer than
// `n` if too few eligible cells remain (never exceeds available).
export function addPackages(
  state: GridState,
  n: number,
  rng: () => number = Math.random,
): GridState {
  const { cols, rows, blocked, specials } = state.layout;
  const unvisited: number[] = [];
  const visited: number[] = [];
  for (let c = 0; c < cols * rows; c++) {
    if (c === START || blocked.has(c) || specials.has(c)) continue;
    (state.visited.has(c) ? visited : unvisited).push(c);
  }
  // deterministic shuffle so the pick order is seeded, not index-biased
  const shuffle = (a: number[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = [...shuffle(unvisited), ...shuffle(visited)].slice(0, n);
  if (pick.length === 0) return state;
  const next = new Set(specials);
  for (const c of pick) next.add(c);
  return { ...state, layout: { ...state.layout, specials: next } };
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

  if (isArmed(state) && state.layout.depots.has(cellIdx)) {
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
