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
export type GridState = {
  player: { x: number; y: number };
  layout: Layout;
  visited: Set<number>;
  collected: Set<number>;
  // rival stops (reserved cells) YOU delivered to this day — once the Poach upgrade is
  // owned your vans can steal a rival's stop; it pays you and counts toward buying them
  // out. Resets each day (the streets regenerate); the permanent effect is the discount.
  converted: Set<number>;
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
  companyCount = 0,
  boughtCount = 0,
  lockerFrac = 0,
): GridState {
  return {
    player: { x: 0, y: 0 },
    layout: genLayout(cols, rows, packageCount, depotCount, rng, companyCount, boughtCount, lockerFrac),
    visited: new Set([START]),
    collected: new Set(),
    converted: new Set(),
    routes,
    dayEnded: false,
  };
}

// Start the next day: a fresh route carrying the current routes count forward.
export function startDay(
  state: GridState,
  opts: { cols: number; rows: number; packageCount: number; depotCount?: number; rng?: () => number; companyCount?: number; boughtCount?: number; lockerFrac?: number },
): GridState {
  return newRoute(opts.cols, opts.rows, opts.packageCount, opts.depotCount ?? 1, state.routes, opts.rng, opts.companyCount ?? 0, opts.boughtCount ?? 0, opts.lockerFrac ?? 0);
}

// Grow the CURRENT route's map to newCols x newRows LIVE (mid-route). growLayout
// remaps blocked/specials + guarantees reachability; visited/collected are remapped
// to the same wider row-width so coverage/deliveries survive. player {x,y}, routes,
// and collected semantics are unchanged. Only ever grows (no-op if not bigger).
export function growState(
  state: GridState,
  newCols: number,
  newRows: number,
  rivalFraction = 0,
  rng: () => number = Math.random,
): GridState {
  const { cols: oldCols, rows: oldRows } = state.layout;
  if (newCols <= oldCols && newRows <= oldRows) return state;
  return {
    ...state,
    layout: growLayout(state.layout, newCols, newRows, rivalFraction, rng),
    visited: remapIndices(state.visited, oldCols, newCols),
    collected: remapIndices(state.collected, oldCols, newCols),
    converted: remapIndices(state.converted, oldCols, newCols),
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
  const { cols, rows, blocked, specials, reserved } = state.layout;
  const unvisited: number[] = [];
  const visited: number[] = [];
  for (let c = 0; c < cols * rows; c++) {
    // rival-held cells are off-limits for your deliveries
    if (c === START || blocked.has(c) || specials.has(c) || reserved?.has(c)) continue;
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
  perDelivery: number;
  // cash paid when a day is completed at a depot (0 until Bulk Contracts is owned)
  routeBonus?: number;
  // the day only ends once every hired driver is back at a depot too (default true =
  // no fleet out). The player reaching the depot alone won't finish while vans deliver.
  driversHome?: boolean;
  // ...and once the rival companies have finished delivering to all their points
  // (default true = no rivals). The downside of expanding: more rivals = longer days.
  rivalsDone?: boolean;
  // Poach upgrade owned: driving over an un-serviced rival stop steals it (pays you)
  canPoach?: boolean;
  packageCount: number;
  // dims for the NEXT route seeded on completion (buying expansion mid-run grows it)
  cols: number;
  rows: number;
  rng?: () => number;
};

// one grid move in (dx,dy). Off-grid/blocked = no-op. Armed + depot ENDS the day
// (same state, routes+1, dayEnded true, paying opts.routeBonus — 0 unless Bulk
// Contracts is owned — and startDay() begins the next route). Otherwise advances a
// cell (tracking coverage for the map% stat, no
// payout) and, if autoDeliver, collects any package driven over. Cash comes only
// from deliveries and finishing a route.
export function applyMove(
  state: GridState,
  dx: number,
  dy: number,
  opts: MoveOpts,
): { state: GridState; earned: number } {
  const { autoDeliver, perDelivery } = opts;
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

  if (isArmed(state) && state.layout.depots.has(cellIdx) && (opts.driversHome ?? true) && (opts.rivalsDone ?? true)) {
    return {
      state: { ...state, routes: state.routes + 1, dayEnded: true },
      earned: opts.routeBonus ?? 0,
    };
  }

  let earned = 0;
  const visited = new Set(state.visited).add(cellIdx); // coverage for map% stat only

  let collected = state.collected;
  let converted = state.converted;
  if (autoDeliver && state.layout.specials.has(cellIdx) && !collected.has(cellIdx)) {
    earned += perDelivery;
    collected = new Set(state.collected).add(cellIdx);
  } else if (autoDeliver && opts.canPoach && state.layout.reserved?.has(cellIdx) && !converted.has(cellIdx)) {
    earned += perDelivery;
    converted = new Set(state.converted).add(cellIdx);
  }

  return {
    state: { ...state, player: { x: nx, y: ny }, visited, collected, converted },
    earned,
  };
}

// Completion that DOESN'T require a fresh move: if the day is armed (all packages
// collected) and the player is already standing on a depot, finish the day right
// now. Covers the case where the fleet (or a remote delivery) collects the last
// package while the player is parked at the warehouse — otherwise the day would
// only end after leaving and re-entering the depot. No-op otherwise.
export function finishIfDone(
  state: GridState,
  opts: { routeBonus?: number; driversHome?: boolean; rivalsDone?: boolean },
): { state: GridState; earned: number } {
  if (state.dayEnded) return { state, earned: 0 };
  const onDepot = state.layout.depots.has(idx(state.player.x, state.player.y, state.layout.cols));
  if (isArmed(state) && onDepot && (opts.driversHome ?? true) && (opts.rivalsDone ?? true)) {
    return {
      state: { ...state, routes: state.routes + 1, dayEnded: true },
      earned: opts.routeBonus ?? 0,
    };
  }
  return { state, earned: 0 };
}

// Collect an arbitrary cell (used by fleet vans): an uncollected special goes to
// `collected`; else, with canPoach, an un-serviced rival stop goes to `converted`.
// Either pays perDelivery; otherwise no-op.
export function collectAt(
  state: GridState,
  cellIdx: number,
  opts: { perDelivery: number; canPoach?: boolean },
): { state: GridState; earned: number } {
  if (state.layout.specials.has(cellIdx) && !state.collected.has(cellIdx)) {
    return {
      state: { ...state, collected: new Set(state.collected).add(cellIdx) },
      earned: opts.perDelivery,
    };
  }
  if (opts.canPoach && state.layout.reserved?.has(cellIdx) && !state.converted.has(cellIdx)) {
    return {
      state: { ...state, converted: new Set(state.converted).add(cellIdx) },
      earned: opts.perDelivery,
    };
  }
  return { state, earned: 0 };
}

// Space action: collect a package underfoot (arms completion) or, with canPoach, steal
// an un-serviced rival stop underfoot; else no-op.
export function collectHere(
  state: GridState,
  opts: { perDelivery: number; canPoach?: boolean },
): { state: GridState; earned: number } {
  return collectAt(state, idx(state.player.x, state.player.y, state.layout.cols), opts);
}
