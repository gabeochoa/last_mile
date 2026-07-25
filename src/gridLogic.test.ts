import { allReachable, genLayout, bfsNextStep, idx, START, COLS, ROWS } from "./gridLogic";

test("genLayout always produces a fully-reachable, valid layout", () => {
  for (let i = 0; i < 500; i++) {
    const { blocked, specials } = genLayout();
    // every open cell reachable from the depot
    expect(allReachable(blocked)).toBe(true);
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

test("bfsNextStep routes around a wall and reduces distance", () => {
  // wall a vertical column at x=1 for y=0..2, forcing a detour downward.
  const blocked = new Set<number>([idx(1, 0), idx(1, 1), idx(1, 2)]);
  const from = idx(0, 0);
  const to = idx(2, 0);
  const step = bfsNextStep(blocked, from, to)!;
  expect(step).not.toBeNull();
  // first step must be a valid single move into an open cell...
  expect(Math.abs(step[0]) + Math.abs(step[1])).toBe(1);
  const nx = 0 + step[0];
  const ny = 0 + step[1];
  expect(blocked.has(idx(nx, ny))).toBe(false);
  // ...and can't go straight right (walled), so it detours down.
  expect(step).toEqual([0, 1]);
  // already-there / unreachable cases
  expect(bfsNextStep(blocked, from, from)).toBeNull();
  const sealed = new Set<number>([idx(1, 0), idx(0, 1)]); // isolate START
  expect(bfsNextStep(sealed, START, idx(2, 2))).toBeNull();
});

test("allReachable is false when a cell is walled off", () => {
  // wall off the whole first row's neighbours around cell 1 so it is isolated
  // block right-of-start (1), and below cells so START(0) cannot reach anything
  const blocked = new Set<number>([1, COLS]); // block (1,0) and (0,1)
  // START (0,0) now has no open neighbours -> other open cells unreachable
  expect(allReachable(blocked)).toBe(false);
});
