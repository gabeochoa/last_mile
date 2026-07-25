import { createState } from "./state";
import { load } from "./save";

test("createState has expected starting fields", () => {
  const s = createState();
  expect(s.day).toBe(1);
  expect(s.daysUntilLastMile).toBe(30);
  expect(s.cash).toBe(0);
  expect(s.upgrades).toEqual({});
});

test("load returns null without storage (node env)", () => {
  expect(load()).toBeNull();
});
