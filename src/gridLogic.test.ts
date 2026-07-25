import {
  allReachable,
  genLayout,
  growLayout,
  bfsNextStep,
  idx,
  START,
  BASE_COLS,
  BASE_ROWS,
  isExpansionCell,
  sizeForExpansion,
  makeRng,
  type Layout,
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

test("genLayout places depotCount depots (incl START) on open non-package cells", () => {
  for (let i = 0; i < 200; i++) {
    const depotCount = 3;
    const { blocked, specials, depots } = genLayout(COLS, ROWS, 4, depotCount, makeRng(i));
    // exactly depotCount depots, START always among them
    expect(depots.size).toBe(depotCount);
    expect(depots.has(START)).toBe(true);
    for (const d of depots) {
      expect(blocked.has(d)).toBe(false); // depots sit on open cells
      expect(specials.has(d)).toBe(false); // packages never overlap a depot
    }
  }
  // default depotCount is 1 (START only)
  expect(genLayout(COLS, ROWS, 4, undefined, makeRng(1)).depots.size).toBe(1);
});

test("genLayout: rivals reserve expansion cells; deliveries never overlap them", () => {
  // expand a few levels so expansion cells exist
  const { cols, rows } = sizeForExpansion(6);
  for (let i = 0; i < 20; i++) {
    const { specials, depots, reserved } = genLayout(cols, rows, 4, 1, makeRng(i), 0.9);
    const rez = reserved ?? new Set<number>();
    // every reserved cell is in the expansion area and off depots/START
    for (const c of rez) {
      expect(isExpansionCell(c, cols)).toBe(true);
      expect(c).not.toBe(START);
      expect(depots.has(c)).toBe(false);
    }
    // your deliveries never sit on a rival cell
    for (const s of specials) expect(rez.has(s)).toBe(false);
  }
});

test("genLayout is deterministic for a given seed", () => {
  const a = genLayout(COLS, ROWS, 4, 1, makeRng(1234));
  const b = genLayout(COLS, ROWS, 4, 1, makeRng(1234));
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

test("growLayout: remaps blocked/specials to (x,y), opens new cells, stays reachable", () => {
  // 4x3 layout, roads on col 0 and row 0, a special at (2,0) and (0,2)
  const oldCols = 4;
  const oldRows = 3;
  const blocked = new Set<number>();
  for (let y = 0; y < oldRows; y++)
    for (let x = 0; x < oldCols; x++)
      if (x !== 0 && y !== 0) blocked.add(idx(x, y, oldCols));
  const specials = new Set<number>([idx(2, 0, oldCols), idx(0, 2, oldCols)]);
  // START plus a second depot at (0,1) — both must remap to (x,y) at the new width
  const depots = new Set<number>([START, idx(0, 1, oldCols)]);
  const layout: Layout = { blocked, specials, depots, cols: oldCols, rows: oldRows };
  expect(allReachable(blocked, oldCols, oldRows)).toBe(true);

  // grow +1 col and +1 row at once
  const g = growLayout(layout, oldCols + 1, oldRows + 1);
  expect(g.cols).toBe(oldCols + 1);
  expect(g.rows).toBe(oldRows + 1);
  // depots keep their (x,y): START stays 0, (0,1) remaps to the wider row-width
  expect(g.depots.has(START)).toBe(true);
  expect(g.depots.has(idx(0, 1, g.cols))).toBe(true);
  expect(g.depots.size).toBe(2);

  // every old special keeps its (x,y) at the new row-width
  const toXY = (c: number, cols: number) => [c % cols, Math.floor(c / cols)];
  const gspecials = [...g.specials].map((c) => toXY(c, g.cols)).sort();
  expect(gspecials).toEqual([[0, 2], [2, 0]].sort());
  // every old blocked keeps its (x,y)
  for (const c of blocked) {
    const [x, y] = toXY(c, oldCols);
    expect(g.blocked.has(idx(x, y, g.cols))).toBe(true);
  }
  // the appended column (x=oldCols) and row (y=oldRows) are OPEN streets
  for (let y = 0; y < g.rows; y++) expect(g.blocked.has(idx(oldCols, y, g.cols))).toBe(false);
  for (let x = 0; x < g.cols; x++) expect(g.blocked.has(idx(x, oldRows, g.cols))).toBe(false);
  // fully reachable
  expect(allReachable(g.blocked, g.cols, g.rows)).toBe(true);
});

test("growLayout: bridges a seam that would otherwise strand the new column", () => {
  // 3x2 with the whole LAST column (x=2) blocked; open cells {0,1,3,4} reachable
  const layout: Layout = {
    blocked: new Set<number>([idx(2, 0, 3), idx(2, 1, 3)]),
    specials: new Set<number>([idx(1, 1, 3)]),
    depots: new Set<number>([START]),
    cols: 3,
    rows: 2,
  };
  expect(allReachable(layout.blocked, 3, 2)).toBe(true);

  // add a column: the new x=3 column is open but sits behind a fully-blocked seam
  // (old x=2), so without bridging it would be stranded from START.
  const g = growLayout(layout, 4, 2);
  expect(g.cols).toBe(4);
  // new column is open
  expect(g.blocked.has(idx(3, 0, 4))).toBe(false);
  expect(g.blocked.has(idx(3, 1, 4))).toBe(false);
  // special remapped from (1,1) to the wider width and still open
  expect(g.specials.has(idx(1, 1, 4))).toBe(true);
  expect(g.blocked.has(idx(1, 1, 4))).toBe(false);
  // bridging opened a seam cell so everything is reachable
  expect(allReachable(g.blocked, g.cols, g.rows)).toBe(true);
});

test("allReachable is false when a cell is walled off", () => {
  // wall off the whole first row's neighbours around cell 1 so it is isolated
  // block right-of-start (1), and below cells so START(0) cannot reach anything
  const blocked = new Set<number>([1, COLS]); // block (1,0) and (0,1)
  // START (0,0) now has no open neighbours -> other open cells unreachable
  expect(allReachable(blocked, COLS, ROWS)).toBe(false);
});
