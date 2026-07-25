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

// BFS over open (non-blocked) cells; returns the first-step [dx,dy] on a shortest
// path from `from` to `to`, or null if already there / unreachable.
export function bfsNextStep(
  blocked: Set<number>,
  from: number,
  to: number,
): [number, number] | null {
  if (from === to) return null;
  const prev = new Map<number, number>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    if (c === to) break;
    const x = c % COLS;
    const y = Math.floor(c / COLS);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const n = idx(nx, ny);
      if (blocked.has(n) || seen.has(n)) continue;
      seen.add(n);
      prev.set(n, c);
      queue.push(n);
    }
  }
  if (!prev.has(to)) return null;
  // walk back from `to` to the cell right after `from`
  let step = to;
  while (prev.get(step) !== from) step = prev.get(step)!;
  return [(step % COLS) - (from % COLS), Math.floor(step / COLS) - Math.floor(from / COLS)];
}

export type Layout = { blocked: Set<number>; specials: Set<number> };

// Pick road indices along a 6-long axis: a random spacing (2 or 3) and offset,
// e.g. cols [0,3] or rows [1,3,5]. Roads are open lanes; the gaps become blocks.
function roadLines(rng: () => number): number[] {
  const spacing = 2 + Math.floor(rng() * 2); // 2 or 3
  const offset = Math.floor(rng() * spacing);
  const lines: number[] = [];
  for (let i = offset; i < COLS; i += spacing) lines.push(i);
  return lines;
}

// City layout: a connected grid of open streets (road rows x road cols) with the
// interior gaps filled by solid building blocks (blocked). Road rows and cols
// always intersect, so every open cell is reachable; START is forced onto a road.
export function cityBlocked(rng: () => number = Math.random): Set<number> {
  const roadCols = roadLines(rng);
  const roadRows = roadLines(rng);
  // guarantee START (0,0) sits on the street network
  if (!roadCols.includes(0) && !roadRows.includes(0)) roadCols.push(0);
  const blocked = new Set<number>();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!roadCols.includes(x) && !roadRows.includes(y)) blocked.add(idx(x, y));
    }
  }
  return blocked;
}

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
