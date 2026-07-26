import { describe, it, expect, beforeEach } from "vitest";
import { getVolume, setVolume } from "./audio";

// node env has no localStorage; stub one so the guarded round-trip is exercisable.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => void (store[k] = v),
    removeItem: (k: string) => void delete store[k],
    clear: () => {},
    key: () => null,
    length: 0,
  };
});

describe("volume", () => {
  it("defaults to full, round-trips set/get, and clamps to 0..1", () => {
    expect(getVolume()).toBe(1);
    setVolume(0.5);
    expect(getVolume()).toBe(0.5);
    setVolume(0);
    expect(getVolume()).toBe(0);
    setVolume(2);
    expect(getVolume()).toBe(1);
    setVolume(-1);
    expect(getVolume()).toBe(0);
  });

  it("honors a legacy mute flag as volume 0 when no volume is saved", () => {
    localStorage.setItem("lastmile.muted", "1");
    expect(getVolume()).toBe(0);
  });
});
