// Pure, non-React grid logic: dimensions, indexing, and layout generation.
import { BASE_PACKAGES } from "./config";

export const COLS = 6;
export const ROWS = 6;
export const CELL = 48;
export const PAD = 16;

export const idx = (x: number, y: number) => y * COLS + x;
export const START = idx(0, 0);

// tiny deterministic PRNG (mulberry32) so tests can seed layouts
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// BFS from START over non-blocked cells; true only if every open cell is reachable
export function allReachable(blocked: Set<number>): boolean {
  const total = COLS * ROWS - blocked.size;
  const seen = new Set([START]);
  const queue = [START];
  while (queue.length) {
    const c = queue.shift()!;
    const x = c % COLS;
    const y = Math.floor(c / COLS);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const n = idx(nx, ny);
      if (blocked.has(n) || seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen.size === total;
}

// `count` packages on random open (non-blocked, non-start) cells — the objective
export function genSpecials(
  blocked: Set<number>,
  count = BASE_PACKAGES,
  rng: () => number = Math.random,
): Set<number> {
  const open: number[] = [];
  for (let c = 0; c < COLS * ROWS; c++) {
    if (c !== START && !blocked.has(c)) open.push(c);
  }
  const specials = new Set<number>();
  const want = Math.min(open.length, count);
  while (specials.size < want) {
    specials.add(open[Math.floor(rng() * open.length)]);
  }
  return specials;
}

export type Layout = { blocked: Set<number>; specials: Set<number> };

// fresh random layout: 6-9 blocked cells (never START), guaranteed fully reachable
export function genLayout(count = BASE_PACKAGES, rng: () => number = Math.random): Layout {
  for (let attempt = 0; attempt < 50; attempt++) {
    const blocked = new Set<number>();
    const nBlocked = 6 + Math.floor(rng() * 4); // 6-9
    while (blocked.size < nBlocked) {
      const c = Math.floor(rng() * COLS * ROWS);
      if (c !== START) blocked.add(c);
    }
    if (allReachable(blocked)) return { blocked, specials: genSpecials(blocked, count, rng) };
  }
  const blocked = new Set<number>(); // fallback: no blocked cells is trivially reachable
  return { blocked, specials: genSpecials(blocked, count, rng) };
}
