import { addPackages, applyMove, collectAt, collectHere, newRoute, startDay, type GridState } from "./gridState";
import { BASE_COLS, BASE_ROWS, START, idx, makeRng } from "./gridLogic";
import { ROUTE_BONUS, SPECIAL_BONUS, upgradeCost, type Upgrade } from "./config";

const COLS = BASE_COLS;
const ROWS = BASE_ROWS;

// BFS over open (non-blocked) cells; returns the [dx,dy] steps from `from` to `to`.
function bfsPath(from: number, to: number, blocked: Set<number>): [number, number][] {
  const prev = new Map<number, number>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    if (c === to) break;
    const x = c % COLS;
    const y = Math.floor(c / COLS);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const n = idx(nx, ny, COLS);
      if (blocked.has(n) || seen.has(n)) continue;
      seen.add(n);
      prev.set(n, c);
      queue.push(n);
    }
  }
  const cells: number[] = [];
  for (let c = to; c !== from; c = prev.get(c)!) cells.push(c);
  cells.reverse();
  let cur = from;
  const steps: [number, number][] = [];
  for (const c of cells) {
    steps.push([(c % COLS) - (cur % COLS), Math.floor(c / COLS) - Math.floor(cur / COLS)]);
    cur = c;
  }
  return steps;
}

test("playing a full route ends the day, then startDay begins the next one", () => {
  const rng = makeRng(1234);
  const opts = { autoDeliver: true, perDelivery: SPECIAL_BONUS, packageCount: 4, cols: COLS, rows: ROWS, rng };
  let s = newRoute(COLS, ROWS, 4, 1, 0, rng);
  const packages = [...s.layout.specials];
  const layoutBefore = s.layout;
  const blocked = s.layout.blocked;
  let earned = 0;

  // visit each package (auto-deliver collects on entry), then drive back to depot
  let at = START;
  for (const dest of [...packages, START]) {
    for (const [dx, dy] of bfsPath(at, dest, blocked)) {
      const r = applyMove(s, dx, dy, opts);
      s = r.state;
      earned += r.earned;
    }
    at = dest;
  }

  // reaching the depot armed ENDS the day: routes bumped, layout untouched
  expect(s.routes).toBe(1); // completed exactly once
  expect(s.dayEnded).toBe(true);
  expect(s.layout).toBe(layoutBefore); // NOT regenerated
  expect(s.collected.size).toBe(4); // packages stay collected on the finished route
  // cash is exactly route bonus + 4 package deliveries — no movement income
  expect(earned).toBe(ROUTE_BONUS + 4 * SPECIAL_BONUS);

  // startDay begins the next route with the same dims, carrying routes forward
  const next = startDay(s, { cols: COLS, rows: ROWS, packageCount: 4, rng });
  expect(next.dayEnded).toBe(false);
  expect(next.routes).toBe(1); // preserved
  expect(next.collected.size).toBe(0); // fresh
  expect(next.visited.size).toBe(1);
  expect([...next.visited]).toEqual([START]);
  expect(next.player).toEqual({ x: 0, y: 0 });
  expect(next.layout.specials.size).toBe(4); // packages back to full count
});

test("regression: completing a route ends the day and freezes further moves", () => {
  const rng = makeRng(99);
  // armed state one cell east of the depot with the sole package already collected
  const armed: GridState = {
    player: { x: 1, y: 0 },
    layout: { blocked: new Set(), specials: new Set([idx(2, 0, COLS)]), depots: new Set([START]), cols: COLS, rows: ROWS },
    collected: new Set([idx(2, 0, COLS)]),
    visited: new Set([START, idx(1, 0, COLS)]),
    routes: 0,
    dayEnded: false,
  };
  const opts = { autoDeliver: true, perDelivery: SPECIAL_BONUS, packageCount: 4, cols: COLS, rows: ROWS, rng };

  // move INTO the depot: ends the day
  const first = applyMove(armed, -1, 0, opts);
  expect(first.earned).toBe(ROUTE_BONUS);
  expect(first.state.routes).toBe(1);
  expect(first.state.dayEnded).toBe(true);

  // any move AGAIN while the day is ended is a frozen no-op (no re-completion, no pay)
  const ended = first.state;
  const second = applyMove(ended, 1, 0, opts);
  expect(second.state).toBe(ended); // same reference — nothing changed
  expect(second.earned).toBe(0);
  expect(second.state.routes).toBe(1);
});

test("applyMove completes the route at ANY depot when armed, not just START", () => {
  const rng = makeRng(3);
  // armed one cell west of a SECOND depot at (2,0); START(0,0) is the other depot
  const secondDepot = idx(2, 0, COLS);
  const armed: GridState = {
    player: { x: 1, y: 0 },
    layout: {
      blocked: new Set(),
      specials: new Set([idx(3, 0, COLS)]),
      depots: new Set([START, secondDepot]),
      cols: COLS,
      rows: ROWS,
    },
    collected: new Set([idx(3, 0, COLS)]), // all packages collected -> armed
    visited: new Set([START, idx(1, 0, COLS)]),
    routes: 0,
    dayEnded: false,
  };
  const opts = { autoDeliver: true, perDelivery: SPECIAL_BONUS, packageCount: 4, cols: COLS, rows: ROWS, rng };

  // stepping east onto the non-START depot ends the day + pays the route bonus
  const done = applyMove(armed, 1, 0, opts);
  expect(done.state.player).toEqual(armed.player); // completion doesn't move the player
  expect(done.earned).toBe(ROUTE_BONUS);
  expect(done.state.routes).toBe(1);
  expect(done.state.dayEnded).toBe(true);
});

test("collectHere collects an uncollected package underfoot, else no-op", () => {
  const base: GridState = {
    player: { x: 2, y: 0 },
    layout: { blocked: new Set(), specials: new Set([idx(2, 0, COLS)]), depots: new Set([START]), cols: COLS, rows: ROWS },
    collected: new Set(),
    visited: new Set([START]),
    routes: 0,
    dayEnded: false,
  };
  const hit = collectHere(base, { perDelivery: SPECIAL_BONUS });
  expect(hit.earned).toBe(SPECIAL_BONUS);
  expect(hit.state.collected.has(idx(2, 0, COLS))).toBe(true);
  // no package here -> no-op, same reference
  const miss = collectHere({ ...base, player: { x: 3, y: 0 } }, { perDelivery: SPECIAL_BONUS });
  expect(miss.earned).toBe(0);
});

test("collectAt collects an uncollected special at any cell, else no-op", () => {
  const base: GridState = {
    player: { x: 0, y: 0 },
    layout: { blocked: new Set(), specials: new Set([idx(2, 0, COLS)]), depots: new Set([START]), cols: COLS, rows: ROWS },
    collected: new Set(),
    visited: new Set([START]),
    routes: 0,
    dayEnded: false,
  };
  const hit = collectAt(base, idx(2, 0, COLS), { perDelivery: SPECIAL_BONUS });
  expect(hit.earned).toBe(SPECIAL_BONUS);
  expect(hit.state.collected.has(idx(2, 0, COLS))).toBe(true);
  // already collected -> no-op, same reference
  const again = collectAt(hit.state, idx(2, 0, COLS), { perDelivery: SPECIAL_BONUS });
  expect(again.earned).toBe(0);
  expect(again.state).toBe(hit.state);
  // empty cell -> no-op
  const empty = collectAt(base, idx(3, 0, COLS), { perDelivery: SPECIAL_BONUS });
  expect(empty.earned).toBe(0);
  expect(empty.state).toBe(base);
});

test("addPackages: adds min(n, eligible), respects exclusions, prefers unvisited, deterministic", () => {
  const base: GridState = {
    player: { x: 0, y: 0 },
    layout: {
      blocked: new Set([idx(1, 0, COLS)]),
      specials: new Set([idx(2, 0, COLS)]),
      depots: new Set([START]),
      cols: COLS,
      rows: ROWS,
    },
    // depot + one already-visited cell (so we can prove unvisited is preferred)
    visited: new Set([START, idx(3, 0, COLS)]),
    collected: new Set(),
    routes: 0,
    dayEnded: false,
  };

  const out = addPackages(base, 3, makeRng(7));
  const added = [...out.layout.specials].filter((c) => !base.layout.specials.has(c));
  // exactly n new, none on blocked/START/existing specials
  expect(added.length).toBe(3);
  for (const c of added) {
    expect(base.layout.blocked.has(c)).toBe(false);
    expect(c).not.toBe(START);
    expect(base.layout.specials.has(c)).toBe(false);
  }
  // prefers unvisited: none of the added should be the already-visited cell while
  // unvisited cells remain plentiful
  expect(added).not.toContain(idx(3, 0, COLS));

  // deterministic for a seeded rng
  const a = addPackages(base, 3, makeRng(7)).layout.specials;
  const b = addPackages(base, 3, makeRng(7)).layout.specials;
  expect([...a].sort()).toEqual([...b].sort());

  // never exceeds available eligible cells
  const tiny: GridState = {
    player: { x: 0, y: 0 },
    layout: { blocked: new Set(), specials: new Set([idx(1, 0, COLS)]), depots: new Set([START]), cols: 2, rows: 1 },
    visited: new Set([START]),
    collected: new Set(),
    routes: 0,
    dayEnded: false,
  };
  // 2x1 grid: depot + one special = 0 eligible cells left
  expect(addPackages(tiny, 5).layout.specials.size).toBe(1);
});

test("upgradeCost is round, starts at baseCost, and strictly increases", () => {
  const u: Upgrade = { name: "x", effect: "", baseCost: 30, costMult: 1.6, maxLevel: 15 };
  expect(upgradeCost(u, 0)).toBe(30); // level 0 == baseCost
  let prev = 0;
  for (let l = 0; l < 15; l++) {
    const c = upgradeCost(u, l);
    expect(c).toBeGreaterThan(prev); // strictly increasing
    const step = c < 100 ? 5 : c < 1000 ? 10 : c < 10000 ? 50 : 100;
    expect(c % step).toBe(0); // rounded to a nice step
    prev = c;
  }
});
