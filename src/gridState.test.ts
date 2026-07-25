import { applyMove, collectAt, collectHere, newRoute, type GridState } from "./gridState";
import { BASE_COLS, BASE_ROWS, START, idx, makeRng } from "./gridLogic";
import { ROUTE_BONUS, SPECIAL_BONUS } from "./config";

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

test("playing a full route increments routes exactly once and resets state", () => {
  const rng = makeRng(1234);
  const opts = { autoDeliver: true, cashMult: 1, packageCount: 4, cols: COLS, rows: ROWS, rng };
  let s = newRoute(COLS, ROWS, 4, 0, rng);
  const packages = [...s.layout.specials];
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

  expect(s.routes).toBe(1); // completed exactly once
  expect(s.collected.size).toBe(0); // reset
  expect(s.visited.size).toBe(1);
  expect([...s.visited]).toEqual([START]);
  expect(s.player).toEqual({ x: 0, y: 0 });
  expect(s.layout.specials.size).toBe(4); // packages back to full count
  // cash is exactly route bonus + 4 package deliveries — no movement income
  expect(earned).toBe(ROUTE_BONUS + 4 * SPECIAL_BONUS);
});

test("regression: completing a route does not re-complete on the next move", () => {
  const rng = makeRng(99);
  // armed state one cell east of the depot with the sole package already collected
  const armed: GridState = {
    player: { x: 1, y: 0 },
    layout: { blocked: new Set(), specials: new Set([idx(2, 0, COLS)]), cols: COLS, rows: ROWS },
    collected: new Set([idx(2, 0, COLS)]),
    visited: new Set([START, idx(1, 0, COLS)]),
    routes: 0,
  };
  const opts = { autoDeliver: true, cashMult: 1, packageCount: 4, cols: COLS, rows: ROWS, rng };

  // move INTO the depot: completes the route
  const first = applyMove(armed, -1, 0, opts);
  expect(first.earned).toBe(ROUTE_BONUS);
  expect(first.state.routes).toBe(1);
  expect(first.state.collected.size).toBe(0); // fresh route
  expect(first.state.player).toEqual({ x: 0, y: 0 });

  // move AGAIN with the returned fresh state: must NOT complete again
  const fresh = first.state;
  const dir = ([[1, 0], [0, 1], [-1, 0], [0, -1]] as const).find(([dx, dy]) => {
    const nx = 0 + dx;
    const ny = 0 + dy;
    return nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && !fresh.layout.blocked.has(idx(nx, ny, COLS));
  })!;
  const second = applyMove(fresh, dir[0], dir[1], opts);
  expect(second.state.routes).toBe(1); // still 1 — no re-completion
  // ordinary move earns nothing now; a package underfoot (autoDeliver) may add SPECIAL_BONUS
  expect([0, SPECIAL_BONUS]).toContain(second.earned);
  expect(second.earned).toBeLessThan(ROUTE_BONUS);
  expect(second.state.player).toEqual({ x: dir[0], y: dir[1] });
});

test("collectHere collects an uncollected package underfoot, else no-op", () => {
  const base: GridState = {
    player: { x: 2, y: 0 },
    layout: { blocked: new Set(), specials: new Set([idx(2, 0, COLS)]), cols: COLS, rows: ROWS },
    collected: new Set(),
    visited: new Set([START]),
    routes: 0,
  };
  const hit = collectHere(base, { cashMult: 1 });
  expect(hit.earned).toBe(SPECIAL_BONUS);
  expect(hit.state.collected.has(idx(2, 0, COLS))).toBe(true);
  // no package here -> no-op, same reference
  const miss = collectHere({ ...base, player: { x: 3, y: 0 } }, { cashMult: 1 });
  expect(miss.earned).toBe(0);
});

test("collectAt collects an uncollected special at any cell, else no-op", () => {
  const base: GridState = {
    player: { x: 0, y: 0 },
    layout: { blocked: new Set(), specials: new Set([idx(2, 0, COLS)]), cols: COLS, rows: ROWS },
    collected: new Set(),
    visited: new Set([START]),
    routes: 0,
  };
  const hit = collectAt(base, idx(2, 0, COLS), { cashMult: 1 });
  expect(hit.earned).toBe(SPECIAL_BONUS);
  expect(hit.state.collected.has(idx(2, 0, COLS))).toBe(true);
  // already collected -> no-op, same reference
  const again = collectAt(hit.state, idx(2, 0, COLS), { cashMult: 1 });
  expect(again.earned).toBe(0);
  expect(again.state).toBe(hit.state);
  // empty cell -> no-op
  const empty = collectAt(base, idx(3, 0, COLS), { cashMult: 1 });
  expect(empty.earned).toBe(0);
  expect(empty.state).toBe(base);
});
