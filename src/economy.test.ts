import { upgradeCost, deliveryRate } from "./economy";
import { UPGRADES } from "./config";
import { createState } from "./state";

test("upgradeCost returns a number", () => {
  expect(typeof upgradeCost(UPGRADES[0], 0)).toBe("number");
});

test("deliveryRate reflects drivers and automation", () => {
  const state = createState();
  state.drivers = 2;
  state.automationLevel = 3;
  expect(deliveryRate(state)).toBe(5);
});
