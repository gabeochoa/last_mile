import {
  allReachable,
  genLayout,
  bfsNextStep,
  idx,
  START,
  BASE_COLS,
  BASE_ROWS,
  sizeForExpansion,
  makeRng,
} from "./gridLogic";

const COLS = BASE_COLS;
const ROWS = BASE_ROWS;

test("genLayout always produces a fully-reachable, valid layout", () => {
  for (let i = 0; i < 500; i++) {
    const { blocked, specials } = genLayout(COLS, ROWS);
    // every open cell reachable from the depot
    expect(allReachable(blocked, COLS, ROWS)).toBe(true);
    // depot is never blocked
    expect(blocked.has(START)).toBe(false);
    for (const s of specials) {
      // specials sit on open, non-start cells within the grid
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(COLS * ROWS);
      expect(s).not.toBe(START);
      expect(blocked.has(s)).toBe(false);
    }
  }
});

test("genLayout is deterministic for a given seed", () => {
  const a = genLayout(COLS, ROWS, 4, makeRng(1234));
  const b = genLayout(COLS, ROWS, 4, makeRng(1234));
  expect([...a.blocked].sort((m, n) => m - n)).toEqual([...b.blocked].sort((m, n) => m - n));
  expect([...a.specials].sort((m, n) => m - n)).toEqual([...b.specials].sort((m, n) => m - n));
  // and leaves plenty of open cells for packages (city, not a maze)
  expect(COLS * ROWS - a.blocked.size).toBeGreaterThanOrEqual(5);
});

test("sizeForExpansion grows +1 col then +1 row, alternating from the base", () => {
  expect(sizeForExpansion(0)).toEqual({ cols: 6, rows: 6 });
  expect(sizeForExpansion(1)).toEqual({ cols: 7, rows: 6 });
  expect(sizeForExpansion(2)).toEqual({ cols: 7, rows: 7 });
  expect(sizeForExpansion(3)).toEqual({ cols: 8, rows: 7 });
  expect(sizeForExpansion(20)).toEqual({ cols: 16, rows: 16 });
});

test("genLayout stays fully reachable at expanded sizes", () => {
  for (const level of [1, 2, 5, 10, 20]) {
    const { cols, rows } = sizeForExpansion(level);
    for (let i = 0; i < 50; i++) {
      const { blocked, specials, cols: lc, rows: lr } = genLayout(cols, rows);
      expect(lc).toBe(cols);
      expect(lr).toBe(rows);
      expect(blocked.has(START)).toBe(false);
      expect(allReachable(blocked, cols, rows)).toBe(true);
      for (const s of specials) expect(blocked.has(s)).toBe(false);
    }
  }
});

test("bfsNextStep routes around a wall and reduces distance", () => {
  // wall a vertical column at x=1 for y=0..2, forcing a detour downward.
  const blocked = new Set<number>([idx(1, 0, COLS), idx(1, 1, COLS), idx(1, 2, COLS)]);
  const from = idx(0, 0, COLS);
  const to = idx(2, 0, COLS);
  const step = bfsNextStep(blocked, from, to, COLS, ROWS)!;
  expect(step).not.toBeNull();
  // first step must be a valid single move into an open cell...
  expect(Math.abs(step[0]) + Math.abs(step[1])).toBe(1);
  const nx = 0 + step[0];
  const ny = 0 + step[1];
  expect(blocked.has(idx(nx, ny, COLS))).toBe(false);
  // ...and can't go straight right (walled), so it detours down.
  expect(step).toEqual([0, 1]);
  // already-there / unreachable cases
  expect(bfsNextStep(blocked, from, from, COLS, ROWS)).toBeNull();
  const sealed = new Set<number>([idx(1, 0, COLS), idx(0, 1, COLS)]); // isolate START
  expect(bfsNextStep(sealed, START, idx(2, 2, COLS), COLS, ROWS)).toBeNull();
});

test("allReachable is false when a cell is walled off", () => {
  // wall off the whole first row's neighbours around cell 1 so it is isolated
  // block right-of-start (1), and below cells so START(0) cannot reach anything
  const blocked = new Set<number>([1, COLS]); // block (1,0) and (0,1)
  // START (0,0) now has no open neighbours -> other open cells unreachable
  expect(allReachable(blocked, COLS, ROWS)).toBe(false);
});
