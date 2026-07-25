import { describe, it, expect } from "vitest";
import { parseSave, type SaveData } from "./save";

describe("parseSave", () => {
  it("round-trips valid data", () => {
    const data: SaveData = { version: 1, cash: 42, upgrades: { fleet: 2 }, routes: 5 };
    expect(parseSave(JSON.stringify(data))).toEqual(data);
  });

  it("rejects malformed json", () => {
    expect(parseSave("not json")).toBeNull();
    expect(parseSave("")).toBeNull();
  });

  it("rejects wrong/old version", () => {
    expect(parseSave(JSON.stringify({ version: 0, cash: 1, upgrades: {}, routes: 0 }))).toBeNull();
  });

  it("rejects wrong shape", () => {
    expect(parseSave(JSON.stringify({ version: 1, cash: "x", upgrades: {}, routes: 0 }))).toBeNull();
    expect(parseSave(JSON.stringify({ version: 1, cash: 1, upgrades: null, routes: 0 }))).toBeNull();
    expect(parseSave(JSON.stringify(42))).toBeNull();
  });
});
