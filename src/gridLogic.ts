// Pure, non-React grid logic: dimensions, indexing, and layout generation.
import { BASE_PACKAGES } from "./config";

// Base grid; Map Expansion grows this. sizeForExpansion applies the growth.
export const BASE_COLS = 6;
export const BASE_ROWS = 6;
export const CELL = 48; // base cell size; Grid derives a fixed canvas from this
export const PAD = 16;

// idx depends on the row width (cols); START is the depot at (0,0) = 0 always.
export const idx = (x: number, y: number, cols: number) => y * cols + x;
export const xOf = (c: number, cols: number) => c % cols;
export const yOf = (c: number, cols: number) => Math.floor(c / cols);
export const START = 0;
// 4-neighbourhood steps, shared by every grid traversal.
export const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

// Cells beyond the original BASE_COLS×BASE_ROWS area (the streets you claim by
// expanding). Rival delivery points only sit here — your base map is already yours.
export const isExpansionCell = (c: number, cols: number) =>
  c % cols >= BASE_COLS || Math.floor(c / cols) >= BASE_ROWS;

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
    for (const [dx, dy] of DIRS) {
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

// `count` packages on random open cells (non-blocked, non-start, non-depot) — the
// objective. `exclude` (the depots) keeps packages off warehouse cells.
export function genSpecials(
  blocked: Set<number>,
  cols: number,
  rows: number,
  count = BASE_PACKAGES,
  rng: () => number = Math.random,
  exclude: Set<number> = new Set(),
): Set<number> {
  const open: number[] = [];
  for (let c = 0; c < cols * rows; c++) {
    if (c !== START && !blocked.has(c) && !exclude.has(c)) open.push(c);
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
    for (const [dx, dy] of DIRS) {
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
  // warehouse cells the fleet homes to and the player can finish at. START(0) is
  // ALWAYS a depot; the Depots upgrade adds more on open non-START cells.
  depots: Set<number>;
  // cells held by rival companies (blue delivery points). Your deliveries never spawn
  // here and they don't count toward capacity — you buy them out to reclaim the space.
  // Optional so older/simpler Layout literals (tests) stay valid.
  reserved?: Set<number>;
  cols: number;
  rows: number;
};

// Reserve `fraction` (0..1) of the open EXPANSION cells (non-START, non-depot) as
// rival delivery points — the new frontier is mostly rival-held until you buy them out.
export function genReserved(
  blocked: Set<number>,
  cols: number,
  rows: number,
  fraction: number,
  rng: () => number = Math.random,
  exclude: Set<number> = new Set(),
): Set<number> {
  const reserved = new Set<number>();
  if (fraction <= 0) return reserved;
  const open: number[] = [];
  for (let c = 0; c < cols * rows; c++) {
    if (c !== START && !blocked.has(c) && !exclude.has(c) && isExpansionCell(c, cols)) open.push(c);
  }
  const want = Math.min(open.length, Math.round(fraction * open.length));
  while (reserved.size < want) reserved.add(open[Math.floor(rng() * open.length)]);
  return reserved;
}

// Place `depotCount` depots: START plus depotCount-1 on random distinct open,
// non-START cells (capped by how many open cells exist).
export function genDepots(
  blocked: Set<number>,
  cols: number,
  rows: number,
  depotCount = 1,
  rng: () => number = Math.random,
): Set<number> {
  const open: number[] = [];
  for (let c = 0; c < cols * rows; c++) {
    if (c !== START && !blocked.has(c)) open.push(c);
  }
  const depots = new Set<number>([START]);
  const want = Math.min(depotCount, open.length + 1);
  while (depots.size < want) depots.add(open[Math.floor(rng() * open.length)]);
  return depots;
}

// Pick road indices along an axis of length `len`: roads with an IRREGULAR gap
// (2–4 cells) between them, so the blocks they bound vary in size and the map reads
// like a real city rather than a uniform lattice. Roads are open lanes; gaps = blocks.
function roadLines(len: number, rng: () => number): number[] {
  const lines: number[] = [];
  let i = Math.floor(rng() * 2); // start on col/row 0 or 1
  while (i < len) {
    lines.push(i);
    i += 2 + Math.floor(rng() * 3); // next road 2–4 cells along
  }
  return lines;
}

// District styles: how likely a cell is a building, on a street cell vs an off-street
// (block interior) cell. Different mixes read as organic / grid / open / dense.
export const DISTRICT_STYLES: { name: string; road: number; off: number }[] = [
  { name: "organic", road: 0.12, off: 0.88 }, // jagged frontages + courtyards
  { name: "grid", road: 0.0, off: 1.0 },      // perfect lattice of blocks
  { name: "open", road: 0.0, off: 0.45 },     // sparse — lots of plazas/lots
  { name: "dense", road: 0.28, off: 0.96 },   // buildings crowd the streets
  { name: "maze", road: 0.62, off: 0.99 },    // nearly solid — ensureReachable carves winding corridors
];
export const REGION = 100; // world splits into REGION×REGION districts, each its own style
// origin=organic, right=grid, below=open, diagonal=dense, then the 2×2 pattern repeats.
export const districtStyle = (x: number, y: number) =>
  DISTRICT_STYLES[(Math.floor(x / REGION) + Math.floor(y / REGION) * 2) % DISTRICT_STYLES.length];

// City layout: irregular streets, with each 100×100 district filled in its own style
// (see districtStyle). Connectivity isn't guaranteed here; genLayout runs
// ensureReachable to carve streets so every open cell connects back to START.
export function cityBlocked(cols: number, rows: number, rng: () => number = Math.random): Set<number> {
  const roadCols = roadLines(cols, rng);
  const roadRows = roadLines(rows, rng);
  const isRoad = (x: number, y: number) => roadCols.includes(x) || roadRows.includes(y);
  const blocked = new Set<number>();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = idx(x, y, cols);
      if (c === START) continue; // your first depot is always open
      const style = districtStyle(x, y);
      if (rng() < (isRoad(x, y) ? style.road : style.off)) blocked.add(c);
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
  for (;;) {
    // open cells reachable from START
    const reached = new Set([START]);
    const q = [START];
    while (q.length) {
      const c = q.shift()!;
      const x = c % cols;
      const y = Math.floor(c / cols);
      for (const [dx, dy] of DIRS) {
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
      for (const [dx, dy] of DIRS) {
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
export function growLayout(
  layout: Layout,
  newCols: number,
  newRows: number,
  rivalFraction = 0,
  rng: () => number = Math.random,
): Layout {
  const { cols: oldCols, rows: oldRows } = layout;
  if (newCols <= oldCols && newRows <= oldRows) return layout;
  const blocked = remapIndices(layout.blocked, oldCols, newCols);
  const specials = remapIndices(layout.specials, oldCols, newCols);
  const depots = remapIndices(layout.depots, oldCols, newCols);
  const reserved = remapIndices(layout.reserved ?? new Set(), oldCols, newCols);
  // newly-appended cells (the grown column(s)/row(s))
  const newCells: number[] = [];
  for (let c = 0; c < newCols * newRows; c++) {
    if (c % newCols >= oldCols || Math.floor(c / newCols) >= oldRows) newCells.push(c);
  }
  // Populate the new frontier: some buildings, then reserve a fraction as rivals. Gated
  // on rivalFraction>0 so the plain grow (tests) still just opens the new streets.
  if (rivalFraction > 0) {
    for (const c of newCells) if (c !== START && rng() < 0.35) blocked.add(c);
  }
  ensureReachable(blocked, newCols, newRows);
  if (rivalFraction > 0) {
    const openNew = newCells.filter((c) => c !== START && !blocked.has(c) && !depots.has(c));
    for (let i = openNew.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [openNew[i], openNew[j]] = [openNew[j], openNew[i]];
    }
    const want = Math.round(rivalFraction * openNew.length);
    for (let i = 0; i < want; i++) reserved.add(openNew[i]);
  }
  return { blocked, specials, depots, reserved, cols: newCols, rows: newRows };
}

// fresh city layout: open streets + building blocks, START open & fully reachable.
// Depots are placed first, then packages on the remaining open cells.
export function genLayout(
  cols: number,
  rows: number,
  count = BASE_PACKAGES,
  depotCount = 1,
  rng: () => number = Math.random,
  rivalFraction = 0,
): Layout {
  // depots first, then rivals claim expansion cells, then your deliveries fill what's
  // left (avoiding both) — so rivals genuinely take space away from you.
  const build = (blocked: Set<number>): Layout => {
    const depots = genDepots(blocked, cols, rows, depotCount, rng);
    const reserved = genReserved(blocked, cols, rows, rivalFraction, rng, depots);
    const exclude = new Set<number>([...depots, ...reserved]);
    return { blocked, specials: genSpecials(blocked, cols, rows, count, rng, exclude), depots, reserved, cols, rows };
  };
  // organic city, then carve streets so every open cell is reachable from START
  const blocked = cityBlocked(cols, rows, rng);
  ensureReachable(blocked, cols, rows);
  return build(blocked);
}
