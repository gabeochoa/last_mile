// Pure, non-React grid logic: dimensions, indexing, and layout generation.
import { BASE_PACKAGES } from "./config";

// Base grid; Map Expansion grows this. sizeForExpansion applies the growth.
export const BASE_COLS = 6;
export const BASE_ROWS = 6;
export const CELL = 48; // base cell size; Grid derives a fixed canvas from this
export const PAD = 16;

// idx depends on the row width (cols); START is the depot at (0,0) = 0 always.
export const idx = (x: number, y: number, cols: number) => y * cols + x;
export const START = 0;

// Each expansion level adds +1 col then +1 row, alternating, from the base.
// 0 -> 6x6, 1 -> 7x6, 2 -> 7x7, 3 -> 8x7, ...
export function sizeForExpansion(level: number): { cols: number; rows: number } {
  return {
    cols: BASE_COLS + Math.ceil(level / 2),
    rows: BASE_ROWS + Math.floor(level / 2),
  };
}

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
export function allReachable(blocked: Set<number>, cols: number, rows: number): boolean {
  const total = cols * rows - blocked.size;
  const seen = new Set([START]);
  const queue = [START];
  while (queue.length) {
    const c = queue.shift()!;
    const x = c % cols;
    const y = Math.floor(c / cols);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const n = idx(nx, ny, cols);
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
  cols: number,
  rows: number,
  count = BASE_PACKAGES,
  rng: () => number = Math.random,
): Set<number> {
  const open: number[] = [];
  for (let c = 0; c < cols * rows; c++) {
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
  cols: number,
  rows: number,
): [number, number] | null {
  if (from === to) return null;
  const prev = new Map<number, number>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    if (c === to) break;
    const x = c % cols;
    const y = Math.floor(c / cols);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const n = idx(nx, ny, cols);
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
  return [(step % cols) - (from % cols), Math.floor(step / cols) - Math.floor(from / cols)];
}

export type Layout = {
  blocked: Set<number>;
  specials: Set<number>;
  cols: number;
  rows: number;
};

// Pick road indices along an axis of length `len`: a random spacing (2 or 3) and
// offset, e.g. cols [0,3] or rows [1,3,5]. Roads are open lanes; gaps become blocks.
function roadLines(len: number, rng: () => number): number[] {
  const spacing = 2 + Math.floor(rng() * 2); // 2 or 3
  const offset = Math.floor(rng() * spacing);
  const lines: number[] = [];
  for (let i = offset; i < len; i += spacing) lines.push(i);
  return lines;
}

// City layout: a connected grid of open streets (road rows x road cols) with the
// interior gaps filled by solid building blocks (blocked). Road rows and cols
// always intersect, so every open cell is reachable; START is forced onto a road.
export function cityBlocked(cols: number, rows: number, rng: () => number = Math.random): Set<number> {
  const roadCols = roadLines(cols, rng);
  const roadRows = roadLines(rows, rng);
  // guarantee START (0,0) sits on the street network
  if (!roadCols.includes(0) && !roadRows.includes(0)) roadCols.push(0);
  const blocked = new Set<number>();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!roadCols.includes(x) && !roadRows.includes(y)) blocked.add(idx(x, y, cols));
    }
  }
  return blocked;
}

// Remap an index Set from an old row-width to a new one. idx = y*cols + x, so a
// wider row shifts every cell with y>0; x,y (and thus the depot at 0) are preserved.
export function remapIndices(set: Set<number>, oldCols: number, newCols: number): Set<number> {
  if (oldCols === newCols) return new Set(set);
  const out = new Set<number>();
  for (const c of set) out.add(Math.floor(c / oldCols) * newCols + (c % oldCols));
  return out;
}

// Guarantee every open cell is reachable from START by bridging: while some open
// cell is stranded, BFS over ALL cells from it to the nearest reached cell and open
// the blocked cells along that path. Mutates `blocked`. Terminates because each pass
// makes >=1 stranded cell reached and never strands a reached one.
function ensureReachable(blocked: Set<number>, cols: number, rows: number): void {
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (;;) {
    // open cells reachable from START
    const reached = new Set([START]);
    const q = [START];
    while (q.length) {
      const c = q.shift()!;
      const x = c % cols;
      const y = Math.floor(c / cols);
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const n = idx(nx, ny, cols);
        if (blocked.has(n) || reached.has(n)) continue;
        reached.add(n);
        q.push(n);
      }
    }
    // find any open cell that isn't reached
    let target = -1;
    for (let c = 0; c < cols * rows; c++) {
      if (!blocked.has(c) && !reached.has(c)) { target = c; break; }
    }
    if (target === -1) return; // all open cells reachable
    // BFS over all cells (blocked included) from target to the nearest reached cell
    const prev = new Map<number, number>([[target, -1]]);
    const bq = [target];
    let hit = -1;
    while (bq.length) {
      const c = bq.shift()!;
      if (reached.has(c)) { hit = c; break; }
      const x = c % cols;
      const y = Math.floor(c / cols);
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const n = idx(nx, ny, cols);
        if (prev.has(n)) continue;
        prev.set(n, c);
        bq.push(n);
      }
    }
    // open every blocked cell on the bridge from the reached side back to target
    for (let c = hit; c !== -1; c = prev.get(c)!) blocked.delete(c);
  }
}

// Grow a layout to newCols x newRows (only ever grows; never shrinks). Existing
// blocked/specials are remapped to the wider row-width; the appended column(s)/row(s)
// are OPEN streets (never added to blocked). Reachability is then guaranteed by
// opening seam/bridge cells so the new streets connect to the existing network.
export function growLayout(layout: Layout, newCols: number, newRows: number): Layout {
  const { cols: oldCols, rows: oldRows } = layout;
  if (newCols <= oldCols && newRows <= oldRows) return layout;
  const blocked = remapIndices(layout.blocked, oldCols, newCols);
  const specials = remapIndices(layout.specials, oldCols, newCols);
  ensureReachable(blocked, newCols, newRows);
  return { blocked, specials, cols: newCols, rows: newRows };
}

// fresh city layout: open streets + building blocks, START open & fully reachable
export function genLayout(
  cols: number,
  rows: number,
  count = BASE_PACKAGES,
  rng: () => number = Math.random,
): Layout {
  for (let attempt = 0; attempt < 50; attempt++) {
    const blocked = cityBlocked(cols, rows, rng);
    if (!blocked.has(START) && allReachable(blocked, cols, rows)) {
      return { blocked, specials: genSpecials(blocked, cols, rows, count, rng), cols, rows };
    }
  }
  // fallback: fixed road grid (cols 0,3 x rows 0,3) — always connected
  const blocked = new Set<number>();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x !== 0 && x !== 3 && y !== 0 && y !== 3) blocked.add(idx(x, y, cols));
    }
  }
  return { blocked, specials: genSpecials(blocked, cols, rows, count, rng), cols, rows };
}
