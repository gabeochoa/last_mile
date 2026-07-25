import { allReachable, genLayout, START, COLS, ROWS } from "./gridLogic";

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

test("allReachable is false when a cell is walled off", () => {
  // wall off the whole first row's neighbours around cell 1 so it is isolated
  // block right-of-start (1), and below cells so START(0) cannot reach anything
  const blocked = new Set<number>([1, COLS]); // block (1,0) and (0,1)
  // START (0,0) now has no open neighbours -> other open cells unreachable
  expect(allReachable(blocked)).toBe(false);
});
