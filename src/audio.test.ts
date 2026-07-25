import { describe, it, expect, beforeEach } from "vitest";
import { isMuted, setMuted } from "./audio";

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

describe("mute", () => {
  it("defaults unmuted, round-trips set/get", () => {
    expect(isMuted()).toBe(false);
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });
});
