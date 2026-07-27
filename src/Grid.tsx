import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { BASE_COLS, CELL, PAD, idx, flowField, flowDir } from "./gridLogic";
import { addPackages, applyMove, collectAt, collectHere, finishIfDone, growState, newRoute, startDay, type GridState } from "./gridState";
import { BASE_PACKAGES } from "./config";
import { playSfx } from "./audio";

const BG = "#0F0F0F";
const INK = "#ECE7DA";
const INK_RGB: [number, number, number] = [236, 231, 218];
const RIVAL = "#4C86E8"; // rival delivery companies (blue), confined to expanded territory
const EMPTY_SET: Set<number> = new Set(); // stable empty fallback for optional layout.reserved
const RIVAL_TICK_MS = 28; // rival van step interval — finer than before so they glide more smoothly

// hex "#rrggbb" -> [r,g,b], for the pixel-buffer renderer on huge (zoomed-out) maps.
const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Every hired driver back on a depot? (Trivially true with no fleet out.) The day
// only completes once this holds AND the player is home AND all deliveries are done.
const allDriversHome = (
  layout: { depots: Set<number>; cols: number },
  vans: { x: number; y: number }[],
) => vans.every((v) => layout.depots.has(idx(v.x, v.y, layout.cols)));

// ── rival delivery vans (cosmetic) ───────────────────────────────────────────
// The world exists past your map: blue vans drive IN from offscreen to a rival
// delivery point, drop off, then drive back OUT and respawn. Positions may be
// off-grid (drawn in the padding = "offscreen"). Purely visual.
// x,y = float on-screen position (slides); tx,ty = the cell being slid toward;
// gx,gy = the stage goal cell (rival point, then an offscreen edge).
type RivalVan = { x: number; y: number; tx: number; ty: number; gx: number; gy: number; stage: "in" | "out"; wait: number; color: string };
type RLayout = { reserved?: Set<number>; rivalCenters?: [number, number][]; blocked: Set<number>; cols: number; rows: number };

// A cell's rival company = the nearest company center; its color follows from that.
const cellCompany = (c: number, centers: [number, number][], cols: number) => {
  if (!centers.length) return 0;
  const cx = c % cols;
  const cy = Math.floor(c / cols);
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const d = Math.hypot(cx - centers[i][0], cy - centers[i][1]);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
};
const cellColor = (c: number, centers: [number, number][], cols: number, colors: string[]) =>
  colors.length ? colors[cellCompany(c, centers, cols) % colors.length] : RIVAL;

// Open cells on the grid border, with the outward offset — rival vans enter/leave here.
const borderEntries = (layout: RLayout): [number, number, number, number][] => {
  const { cols, rows, blocked } = layout;
  const out: [number, number, number, number][] = [];
  for (let x = 0; x < cols; x++) {
    if (!blocked.has(idx(x, 0, cols))) out.push([x, 0, 0, -1]);
    if (!blocked.has(idx(x, rows - 1, cols))) out.push([x, rows - 1, 0, 1]);
  }
  for (let y = 0; y < rows; y++) {
    if (!blocked.has(idx(0, y, cols))) out.push([0, y, -1, 0]);
    if (!blocked.has(idx(cols - 1, y, cols))) out.push([cols - 1, y, 1, 0]);
  }
  return out;
};

const spawnRivalVan = (layout: RLayout, colors: string[], done: Set<number>): RivalVan | null => {
  // only head for rival points not yet serviced this day; none left => no new van
  const res = layout.reserved ? [...layout.reserved].filter((c) => !done.has(c)) : [];
  const border = borderEntries(layout);
  if (!res.length || !border.length) return null;
  const cell = res[Math.floor(Math.random() * res.length)];
  const [bx, by, ox, oy] = border[Math.floor(Math.random() * border.length)];
  // start just offscreen by an OPEN border cell; goal = the rival point (its company color)
  return {
    x: bx + ox, y: by + oy, tx: bx, ty: by, gx: cell % layout.cols, gy: Math.floor(cell / layout.cols),
    stage: "in", wait: 0, color: cellColor(cell, layout.rivalCenters ?? [], layout.cols, colors),
  };
};

// Ease the van toward its immediate target cell; when it arrives, pick the next cell
// along a wall-avoiding path to its goal (the rival point, then back offscreen).
const stepRivalVan = (
  v: RivalVan,
  layout: RLayout,
  colors: string[],
  flowStep: (from: number, target: number) => [number, number] | null,
  done: Set<number>,
  speed: number,
): RivalVan | null => {
  const { cols } = layout;

  // still sliding toward the current target cell
  const dx = v.tx - v.x;
  const dy = v.ty - v.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.02) {
    const s = Math.min(d, speed);
    return { ...v, x: v.x + (dx / d) * s, y: v.y + (dy / d) * s };
  }

  // arrived at a cell — snap and decide the next one
  const cx = v.tx;
  const cy = v.ty;
  const van = { ...v, x: cx, y: cy };
  if (van.stage === "in" && cx === van.gx && cy === van.gy) {
    // delivered: head for the nearest OPEN border cell to leave (its offscreen depot)
    const border = borderEntries(layout);
    let bx = cx;
    let by = cy;
    let bd = Infinity;
    for (const [ex, ey] of border) {
      const dd = Math.abs(ex - cx) + Math.abs(ey - cy);
      if (dd < bd) { bd = dd; bx = ex; by = ey; }
    }
    return { ...van, stage: "out", wait: 4, gx: bx, gy: by };
  }
  // reached the edge → gone home; take another undelivered point, or leave for good (null)
  if (van.stage === "out" && cx === van.gx && cy === van.gy) {
    return spawnRivalVan(layout, colors, done);
  }
  if (van.wait > 0) return { ...van, wait: van.wait - 1 };
  // both goal (rival point OR border cell) are on-grid now → always flow-field pathable,
  // so a van can never get stuck behind buildings on the way home.
  const dir = flowStep(idx(cx, cy, cols), idx(van.gx, van.gy, cols));
  return dir ? { ...van, tx: cx + dir[0], ty: cy + dir[1] } : { ...van, stage: "out", gx: cx, gy: cy };
};

// Canvas is a SQUARE that fills the right side of the screen (right of the sidebar,
// below the banner), bounded so it never overflows or collides with the small-map
// hero. The grid is centered inside it and cells shrink as the map grows, so early
// routes are chunky and late-game maps zoom out to tiny pixel roads.
const SIDEBAR_PX = 320; // reserved for the upgrades sidebar
const BANNER_PX = 56; // top banner + its padding
const BUTTON_PX = 76; // room below the grid for the Start Day button (+ gap) so it never scrolls off
const HERO_PX = 220; // vertical room the UNOWNED% hero + deliveries take on small maps
// hero = true when the small-map hero is on screen above the grid (reserve room for it).
// Everything must fit in the viewport with no scroll, so subtract all vertical chrome.
const computeCanvas = (hero: boolean) =>
  Math.max(
    BASE_COLS * CELL,
    Math.min(
      window.innerWidth - SIDEBAR_PX - PAD * 2,
      window.innerHeight - BANNER_PX - BUTTON_PX - (hero ? HERO_PX : PAD * 2),
    ),
  );

function drawRegistration(
  ctx: CanvasRenderingContext2D,
  offX: number,
  offY: number,
  gridW: number,
  gridH: number,
) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  const arm = 5;
  const marks: [number, number][] = [
    [offX, offY],
    [offX + gridW, offY],
    [offX, offY + gridH],
    [offX + gridW, offY + gridH],
  ];
  for (const [x, y] of marks) {
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y + arm);
    ctx.stroke();
  }
}

export function Grid({
  onEarn,
  onStats,
  onPoach,
  onDeliver,
  autoDeliver,
  autopilot,
  fleet,
  poach = false,
  quietSfx = false,
  droneCount = 0,
  policeFine = 0,
  mileagePay = 0,
  lockerPerRow = 0,
  vanSpeed,
  daySpeed,
  perDelivery,
  routeBonus,
  extraPackages,
  depotCount,
  autoStartDay,
  companyCount,
  boughtCount,
  rivalColors,
  accent,
  cols,
  rows,
  forceEndSignal = 0,
  initialRoutes = 0,
}: {
  onEarn: (delta: number) => void;
  onStats: (s: { packagesLeft: number; mapPct: number; routes: number; capacity: number; dayEnded: boolean; poachedFrac: number; deliveredToday: number; cellsPerDay: number; droneDeliveredToday: number }) => void;
  // called with how many rival stops you just poached (for the lifetime takeover count)
  onPoach?: (n: number) => void;
  // called with how many of YOUR stops were just delivered (lifetime packages count)
  onDeliver?: (n: number) => void;
  autoDeliver: boolean;
  autopilot: boolean;
  fleet: number;
  // Poach Rivals owned: your vans may deliver to (steal) rival stops
  poach?: boolean;
  // late game (huge $): throttle the delivery chirp to 1 per 50 deliveries so it isn't a drone
  quietSfx?: boolean;
  // Delivery Drones: invisible units that auto-complete this many of your stops per tick
  droneCount?: number;
  // Police Contract: cash paid to you each time a rival makes a delivery (0 = not owned)
  policeFine?: number;
  // Mileage Pay: cash per cell any of your vans drives (0 = not owned)
  mileagePay?: number;
  // Rainforest Lockers: fraction of buildings converted to delivery stops in new routes
  lockerPerRow?: number;
  vanSpeed: number;
  daySpeed: number;
  perDelivery: number;
  routeBonus: number;
  extraPackages: number;
  depotCount: number;
  autoStartDay: boolean;
  // total rival companies present on the map, and how many you've already bought out
  // (bought companies' neighborhoods come back as YOUR deliveries)
  companyCount: number;
  boughtCount: number;
  // one color per rival company (a new company every 5 expansions); cells/vans colored by company
  rivalColors: string[];
  // player's brand color; drives the player, fleet, packages and armed-depot glyphs
  accent: string;
  cols: number;
  rows: number;
  // incremented by the Settings "force end day" button — ends the current day (no bonus)
  forceEndSignal?: number;
  initialRoutes?: number;
}) {
  const ACCENT = accent; // component-scoped so the canvas draw code stays unchanged
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Small-map hero is showing above the grid until the map gets large (mirrors App's
  // bigMap reflow), so reserve room for it. Canvas fills the right side, re-measured
  // on resize and whenever the hero appears/disappears.
  const bigMap = Math.max(cols, rows) >= 9;
  const [canvas, setCanvas] = useState(() => computeCanvas(!bigMap));
  useEffect(() => {
    const recompute = () => setCanvas(computeCanvas(!bigMap));
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [bigMap]);
  const MAX_CANVAS_PX = canvas - PAD * 2;
  // single source of truth for the route; pure applyMove/collectHere produce the next one.
  // The route layout starts fresh on load; only the resumed `routes` count carries over.
  const [gs, setGs] = useState<GridState>(() =>
    newRoute(cols, rows, BASE_PACKAGES + extraPackages, depotCount, initialRoutes, undefined, companyCount, boughtCount, lockerPerRow),
  );
  const [flash, setFlash] = useState<number | null>(null);
  // hired fleet vans: {x,y} + their HOME depot cell, driven by the fleet tick
  // (ref-mirrored). Van i homes to the i-th depot (round-robin over sorted depots).
  // x,y = logical cell (steps on the fleet tick); dx,dy = eased on-screen position so
  // the van SLIDES between cells. target = the package it committed to (persists until
  // collected) so it doesn't flip between equidistant packages and bounce in place.
  const [vans, setVans] = useState<{ x: number; y: number; dx: number; dy: number; home: number; target: number | null }[]>([]);
  const vansRef = useRef(vans);
  vansRef.current = vans;
  const companyCountRef = useRef(companyCount);
  companyCountRef.current = companyCount;
  const boughtCountRef = useRef(boughtCount);
  boughtCountRef.current = boughtCount;
  const rivalColorsRef = useRef(rivalColors);
  rivalColorsRef.current = rivalColors;
  // blue rival delivery vans driving in from offscreen to service rival points
  const [rivalVans, setRivalVans] = useState<RivalVan[]>([]);
  const rivalVansRef = useRef(rivalVans);
  rivalVansRef.current = rivalVans;
  // rival delivery points already serviced by a rival van this day (they fill in). The
  // day can't end until every reserved point is RESOLVED — serviced by a rival OR poached
  // by you. We deliberately do NOT also wait for the rival vans to physically drive off
  // the map: once every stop is done they have nothing left to do, and waiting on a van
  // that's idling/pathing home would hang the day (the downside of expanding is finishing
  // the deliveries, not babysitting empty vans).
  const [rivalDone, setRivalDone] = useState<Set<number>>(() => new Set());
  const rivalDoneRef = useRef(rivalDone);
  rivalDoneRef.current = rivalDone;
  const rivalsAllDone = () => {
    const res = gsRef.current.layout.reserved;
    if (!res || res.size === 0) return true;
    // a reserved stop is resolved once a rival serviced it OR you poached it. rivalDone
    // and converted are kept disjoint (targeting excludes the other), so summing is safe.
    let poached = 0;
    for (const c of gsRef.current.converted) if (res.has(c)) poached++;
    return rivalDoneRef.current.size + poached >= res.size;
  };

  // refs so the once-bound keydown handler always sees latest state/props without
  // re-binding — and gsRef updates SYNCHRONOUSLY so rapid/held keys can't re-enter
  const gsRef = useRef(gs);
  gsRef.current = gs;
  // latest beginDay(), so the once-bound keydown handler can start the day on Space
  const beginDayRef = useRef<() => void>(() => {});
  // autopilot's committed package target (persists until collected) — prevents dithering
  const autopilotTargetRef = useRef<number | null>(null);
  // Cached BFS flow fields per target cell — computed once, reused by every van until the
  // map changes (new day / grow), so pathfinding is paid once, not per tick. Each field is
  // a full-grid Int32Array (~cols*rows*4 bytes), so the cache is LRU-CAPPED: with lockers
  // turning the whole map into targets an uncapped cache would balloon to hundreds of MB.
  const FLOW_CACHE_CAP = 64;
  const flowCacheRef = useRef<{ blocked: Set<number> | null; map: Map<number, Uint8Array> }>({ blocked: null, map: new Map() });
  const flowStep = (from: number, target: number): [number, number] | null => {
    if (from === target) return null;
    const { blocked, cols, rows } = gsRef.current.layout;
    const cache = flowCacheRef.current;
    if (cache.blocked !== blocked) {
      cache.blocked = blocked;
      cache.map.clear();
    }
    let field = cache.map.get(target);
    if (field) {
      // LRU touch: move to newest so it survives eviction
      cache.map.delete(target);
      cache.map.set(target, field);
    } else {
      field = flowField(blocked, cols, rows, target);
      cache.map.set(target, field);
      if (cache.map.size > FLOW_CACHE_CAP) cache.map.delete(cache.map.keys().next().value!); // evict oldest
    }
    return flowDir(field[from]);
  };
  const onEarnRef = useRef(onEarn);
  onEarnRef.current = onEarn;
  const onPoachRef = useRef(onPoach);
  onPoachRef.current = onPoach;
  const onDeliverRef = useRef(onDeliver);
  onDeliverRef.current = onDeliver;
  const poachRef = useRef(poach);
  poachRef.current = poach;
  const policeFineRef = useRef(policeFine);
  policeFineRef.current = policeFine;
  const mileagePayRef = useRef(mileagePay);
  mileagePayRef.current = mileagePay;
  // cells driven this day (fleet + player) and the last completed day's total — used to show
  // Green Energy as a per-DAY figure in the income tooltip.
  const cellsTodayRef = useRef(0);
  const lastDayCellsRef = useRef(0);
  const droneTodayRef = useRef(0); // stops delivered by drones this day (for the breakdown)
  const lockerPerRowRef = useRef(lockerPerRow);
  lockerPerRowRef.current = lockerPerRow;
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const autoDeliverRef = useRef(autoDeliver);
  autoDeliverRef.current = autoDeliver;
  const autopilotRef = useRef(autopilot);
  autopilotRef.current = autopilot;
  const fleetRef = useRef(fleet);
  fleetRef.current = fleet;
  const vanSpeedRef = useRef(vanSpeed);
  vanSpeedRef.current = vanSpeed;
  const daySpeedRef = useRef(daySpeed);
  daySpeedRef.current = daySpeed;
  const perDeliveryRef = useRef(perDelivery);
  perDeliveryRef.current = perDelivery;
  const routeBonusRef = useRef(routeBonus);
  routeBonusRef.current = routeBonus;
  const extraPackagesRef = useRef(extraPackages);
  extraPackagesRef.current = extraPackages;
  const depotCountRef = useRef(depotCount);
  depotCountRef.current = depotCount;
  // dims the NEXT route should use — grows the instant expansion is bought
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // commit a transition result: sync gsRef first (blocks re-entry), then render + pay
  const commit = (r: { state: GridState; earned: number }) => {
    for (const c of r.state.collected) {
      if (!gsRef.current.collected.has(c)) {
        setFlash(c);
        window.setTimeout(() => setFlash(null), 200);
      }
    }
    gsRef.current = r.state;
    setGs(r.state);
    if (r.earned) onEarnRef.current(r.earned);
  };

  // shared per-move options, always reading the latest refs
  const moveOpts = () => ({
    autoDeliver: autoDeliverRef.current,
    perDelivery: perDeliveryRef.current,
    routeBonus: routeBonusRef.current,
    driversHome: allDriversHome(gsRef.current.layout, vansRef.current),
    rivalsDone: rivalsAllDone(),
    canPoach: poachRef.current,
    poachPay: perDeliveryRef.current * 1000,
    mileagePay: mileagePayRef.current,
    packageCount: BASE_PACKAGES + extraPackagesRef.current,
    cols: colsRef.current,
    rows: rowsRef.current,
  });

  useEffect(() => {
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const onKey = (e: KeyboardEvent) => {
      if (gsRef.current.dayEnded) {
        // day over: Space starts the next day (same as the button); other keys frozen
        if (e.key === " ") {
          e.preventDefault();
          beginDayRef.current();
        }
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        commit(collectHere(gsRef.current, { perDelivery: perDeliveryRef.current, canPoach: poachRef.current, poachPay: perDeliveryRef.current * 1000 }));
        return;
      }
      const d = deltas[e.key];
      if (!d) return;
      e.preventDefault();
      commit(applyMove(gsRef.current, d[0], d[1], moveOpts()));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Autopilot: tick toward the nearest uncollected package, then home to the depot
  // to complete the route — applyMove(autoDeliver) collects en route and, once
  // armed, reaching the depot rolls a fresh route so it loops forever.
  useEffect(() => {
    if (!autopilot) return;
    const id = window.setInterval(() => {
      const s = gsRef.current;
      if (s.dayEnded) return; // pause autopilot on the day-end screen
      // armed + everyone home (player parked, fleet back): finish now, no move needed
      const fin = finishIfDone(s, {
        routeBonus: routeBonusRef.current,
        driversHome: allDriversHome(s.layout, vansRef.current),
        rivalsDone: rivalsAllDone(),
      });
      if (fin.state !== s) {
        commit(fin);
        return;
      }
      const { cols: gcols } = s.layout;
      const here = idx(s.player.x, s.player.y, gcols);
      const dist = (c: number) =>
        Math.abs((c % gcols) - s.player.x) + Math.abs(Math.floor(c / gcols) - s.player.y);
      // commit to a package until it's collected (no dithering between equidistant ones);
      // once none remain, finish at the nearest depot. Rival stops are poached only when
      // driven OVER on the way (applyMove's auto-deliver converts them below) — never
      // chased. Chasing them made the player oscillate forever between stops that faster
      // rivals kept servicing first, so the day never ended.
      let t = autopilotTargetRef.current;
      if (!(t != null && s.layout.specials.has(t) && !s.collected.has(t))) {
        let best: number | null = null;
        let bd = Infinity;
        for (const c of s.layout.specials) {
          if (s.collected.has(c)) continue;
          const d = dist(c);
          if (d < bd) { bd = d; best = c; }
        }
        t = best;
        autopilotTargetRef.current = t;
      }
      const target = t ?? [...s.layout.depots].reduce((a, b) => (dist(b) < dist(a) ? b : a));
      const dir = flowStep(here, target);
      if (!dir) return;
      commit(applyMove(gsRef.current, dir[0], dir[1], { ...moveOpts(), autoDeliver: true }));
    }, Math.max(22, Math.round(300 / vanSpeed)));
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilot, vanSpeed]);

  // Keep the van array sized to `fleet` with each van spawned AT its home depot.
  // Van i homes to the i-th sorted depot (round-robin). A NEW layout (new day / live
  // grow) re-homes every van; growing `fleet` only appends new vans. Keyed on the
  // depots Set reference so mid-day changes (Spread Flyers adds specials) don't re-home.
  const prevDepotsRef = useRef(gs.layout.depots);
  useEffect(() => {
    const layoutChanged = prevDepotsRef.current !== gs.layout.depots;
    prevDepotsRef.current = gs.layout.depots;
    const { cols: gcols } = gs.layout;
    const sortedDepots = [...gs.layout.depots].sort((a, b) => a - b);
    const mkVan = (i: number) => {
      const home = sortedDepots[i % sortedDepots.length];
      const x = home % gcols;
      const y = Math.floor(home / gcols);
      return { x, y, dx: x, dy: y, home, target: null };
    };
    setVans((prev) => {
      if (layoutChanged || prev.length > fleet) {
        return Array.from({ length: fleet }, (_, i) => mkVan(i));
      }
      if (prev.length < fleet) {
        return [...prev, ...Array.from({ length: fleet - prev.length }, (_, i) => mkVan(prev.length + i))];
      }
      return prev;
    });
  }, [fleet, gs.layout.depots]);

  // Fleet LOGIC tick: one cell-step per tick at the player's cadence (cellMs). Each tick a
  // van collects where it is (poaching opportunistically), picks the nearest free stop, and
  // BFS-steps one cell toward it (or home). The visible sliding is NOT done here — a
  // separate rAF loop eases dx,dy toward x,y every frame, so motion stays 60fps-smooth no
  // matter the tick rate.
  useEffect(() => {
    if (fleet <= 0) return;
    const cellMs = Math.max(22, Math.round(300 / vanSpeed));
    const id = window.setInterval(() => {
      if (gsRef.current.dayEnded) return; // pause the fleet on the day-end screen
      const { layout } = gsRef.current;
      const { cols: gcols } = layout;
      const claimed = new Set<number>();
      let steps = 0; // cells driven this tick, for Mileage Pay
      // Mutate the van objects IN PLACE (no .map / no {...van} spread): allocating a fresh
      // array of thousands of new van objects every tick was the biggest heap-churn source.
      // The display rAF loop repaints from these same objects, so no setVans is needed here.
      const vans = vansRef.current;
      for (const van of vans) {
        const cell = idx(van.x, van.y, gcols);
        let target = van.target;
        const hit = collectAt(gsRef.current, cell, { perDelivery: perDeliveryRef.current, canPoach: poachRef.current, poachPay: perDeliveryRef.current * 1000 });
        if (hit.earned) {
          gsRef.current = hit.state;
          setGs(hit.state);
          onEarnRef.current(hit.earned);
          target = null;
        }
        const collected = gsRef.current.collected;
        const dist = (c: number) =>
          Math.abs((c % gcols) - van.x) + Math.abs(Math.floor(c / gcols) - van.y);
        // targets are your own stops only; rival stops are poached opportunistically via
        // collectAt above (a van standing on one steals it) — never chased, so no oscillation.
        const keep = target != null && layout.specials.has(target) && !collected.has(target) && !claimed.has(target);
        if (!keep) {
          let best: number | null = null;
          let bd = Infinity;
          for (const c of layout.specials) {
            if (collected.has(c) || claimed.has(c)) continue;
            const d = dist(c);
            if (d < bd) { bd = d; best = c; }
          }
          target = best;
        }
        if (target != null) claimed.add(target);
        van.target = target;
        const dir = flowStep(cell, target ?? van.home);
        if (dir) { van.x += dir[0]; van.y += dir[1]; steps++; }
      }
      if (steps > 0) {
        cellsTodayRef.current += steps;
        if (mileagePayRef.current > 0) onEarnRef.current(steps * mileagePayRef.current);
      }
      // mark every fleet van's cell visited so YOUR drivers leave a gray trail too.
      const vis = gsRef.current.visited;
      for (const van of vans) vis.add(idx(van.x, van.y, gcols));
      // once everyone (incl. the player) is home + all deliveries done, end the day
      const done = finishIfDone(gsRef.current, {
        routeBonus: routeBonusRef.current,
        driversHome: allDriversHome(gsRef.current.layout, vans),
        rivalsDone: rivalsAllDone(),
      });
      if (done.state !== gsRef.current) {
        gsRef.current = done.state;
        setGs(done.state);
        if (done.earned) onEarnRef.current(done.earned);
      }
    }, cellMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet, vanSpeed]);

  // Fleet DISPLAY loop: every animation frame, ease each van's on-screen position (dx,dy)
  // toward its logical cell (x,y) one axis at a time (so vans follow streets, never cut
  // corners). Decoupled from the logic tick → smooth 60fps gliding even when a cell-step is
  // slow. Mutates the van objects in place and repaints via the coalesced scheduleDraw, so
  // it adds no React re-renders. Speed is tuned so a van crosses a cell in ~cellMs, keeping
  // the visible position in step with the logic.
  useEffect(() => {
    if (fleet <= 0) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      const cellMs = Math.max(22, Math.round(300 / vanSpeedRef.current));
      const step = Math.max(0.02, dt / cellMs); // cells to advance this frame
      let moving = false;
      for (const v of vansRef.current) {
        if (v.dx !== v.x) {
          const d = v.x - v.dx;
          const nx = v.dx + Math.sign(d) * Math.min(Math.abs(d), step);
          v.dx = Math.abs(nx - v.x) < 0.01 ? v.x : nx;
          moving = true;
        } else if (v.dy !== v.y) {
          const d = v.y - v.dy;
          const ny = v.dy + Math.sign(d) * Math.min(Math.abs(d), step);
          v.dy = Math.abs(ny - v.y) < 0.01 ? v.y : ny;
          moving = true;
        }
      }
      if (moving) scheduleDraw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet]);

  // Delivery Drones: invisible units (not rendered — they "drop in from above"). Each
  // tick, up to droneCount uncollected stops are completed instantly, ignoring roads. A
  // pure income/clear-speed boost for the very late game; can finish the day's route too.
  useEffect(() => {
    if (droneCount <= 0) return;
    const id = window.setInterval(() => {
      if (gsRef.current.dayEnded) return;
      let state = gsRef.current;
      let earned = 0;
      let n = droneCount;
      for (const c of state.layout.specials) {
        if (n <= 0) break;
        if (state.collected.has(c)) continue;
        const hit = collectAt(state, c, { perDelivery: perDeliveryRef.current });
        if (hit.earned) { state = hit.state; earned += hit.earned; n--; droneTodayRef.current++; }
      }
      if (state === gsRef.current) return;
      gsRef.current = state;
      setGs(state);
      if (earned) onEarnRef.current(earned);
      // drones may have cleared the last stops — end the day if everyone else is already home
      const done = finishIfDone(gsRef.current, {
        routeBonus: routeBonusRef.current,
        driversHome: allDriversHome(gsRef.current.layout, vansRef.current),
        rivalsDone: rivalsAllDone(),
      });
      if (done.state !== gsRef.current) {
        gsRef.current = done.state;
        setGs(done.state);
        if (done.earned) onEarnRef.current(done.earned);
      }
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droneCount]);

  // Rivals field one van per column (like you). Re-seeded only when the RESERVED set
  // changes (new day / grow / buyout) — NOT when Spread Flyers adds specials, which
  // makes a fresh layout object but keeps the same reserved reference.
  useEffect(() => {
    const res = gs.layout.reserved;
    const count = res ? Math.min(res.size, gs.layout.cols) : 0;
    const fresh = new Set<number>();
    setRivalDone(fresh); // new day/layout: nothing delivered yet
    setRivalVans(
      Array.from({ length: count }, () => spawnRivalVan(gs.layout, rivalColorsRef.current, fresh)).filter(
        (v): v is RivalVan => v !== null,
      ),
    );
  }, [gs.layout.reserved]);

  useEffect(() => {
    if (!gs.layout.reserved?.size) return;
    const id = window.setInterval(() => {
      const layout = gsRef.current.layout;
      const reserved = layout.reserved ?? EMPTY_SET;
      const done = rivalDoneRef.current;
      // A stop is "resolved" if a rival already serviced it OR you poached it — rivals must
      // ignore poached stops (don't drive to them, don't re-service them).
      const conv = gsRef.current.converted;
      const resolved = conv.size ? new Set<number>(done) : done;
      if (conv.size) for (const c of conv) resolved.add(c);
      // Rivals always drive one Faster-Vans level ahead of you (+0.5 to the speed factor),
      // so they usually finish their deliveries before you do and you rarely wait on them.
      // Converted to a slide distance for the 55ms rival tick, capped below 1 (no teleport).
      const rivalMs = Math.max(22, Math.round(300 / (vanSpeedRef.current + 0.5)));
      const speed = Math.min(0.95, RIVAL_TICK_MS / rivalMs);
      // Compute synchronously from the ref (NOT inside a setState updater — that runs
      // later, so the `delivered` side-effect never fired: circles never got marked).
      const delivered: number[] = [];
      const next = rivalVansRef.current
        .map((v) => {
          // rivals have auto-deliver: sitting on ANY un-serviced rival point fills it in
          if (Number.isInteger(v.x) && Number.isInteger(v.y)) {
            const at = idx(v.x, v.y, layout.cols);
            if (reserved.has(at) && !resolved.has(at)) delivered.push(at);
          }
          return stepRivalVan(v, layout, rivalColorsRef.current, flowStep, resolved, speed);
        })
        .filter((v): v is RivalVan => v !== null);
      rivalVansRef.current = next;
      setRivalVans(next);
      if (delivered.length) {
        const nd = new Set(done);
        for (const c of delivered) nd.add(c);
        rivalDoneRef.current = nd;
        setRivalDone(nd);
        // Police Contract: fine the rivals for every delivery they just made on your turf
        if (policeFineRef.current > 0) onEarnRef.current(policeFineRef.current * delivered.length);
      }
      // rivals finishing (all points serviced + vans gone) can be the last thing the day
      // was waiting on — end it now if the player + fleet are already home.
      const fin = finishIfDone(gsRef.current, {
        routeBonus: routeBonusRef.current,
        driversHome: allDriversHome(gsRef.current.layout, vansRef.current),
        rivalsDone: rivalsAllDone(),
      });
      if (fin.state !== gsRef.current) {
        gsRef.current = fin.state;
        setGs(fin.state);
        if (fin.earned) onEarnRef.current(fin.earned);
      }
    }, RIVAL_TICK_MS);
    return () => window.clearInterval(id);
  }, [gs.layout.reserved]);

  // End the day RIGHT NOW without the completion bonus, skipping the armed/home/rivals
  // gates. Used by the stuck-day failsafe and the Settings "force end day" button — a
  // forced finish is a bail-out, not an earned completion, so it never pays the bonus.
  const forceEndDay = () => {
    const s = gsRef.current;
    if (s.dayEnded) return;
    const next = { ...s, routes: s.routes + 1, dayEnded: true };
    gsRef.current = next;
    setGs(next);
  };

  // 30s cap: once YOUR side is fully done — every delivery collected (armed), the player
  // parked on a depot, and the whole fleet home — the day should finish within 30 seconds
  // even if the rivals are still dawdling. You did your part, so it completes WITH the
  // bonus (a hard cap on waiting for rivals, not a bail-out).
  const HOME_CAP_MS = 30000;
  const homeSinceRef = useRef<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = gsRef.current;
      if (s.dayEnded) { homeSinceRef.current = null; return; }
      const armed = s.layout.specials.size > 0 && s.collected.size === s.layout.specials.size;
      const onDepot = s.layout.depots.has(idx(s.player.x, s.player.y, s.layout.cols));
      const home = armed && onDepot && allDriversHome(s.layout, vansRef.current);
      // if the day can already finish normally (rivals done) leave it to the other ticks
      if (!home || rivalsAllDone()) { homeSinceRef.current = null; return; }
      if (homeSinceRef.current == null) { homeSinceRef.current = performance.now(); return; }
      if (performance.now() - homeSinceRef.current >= HOME_CAP_MS) {
        const done = finishIfDone(s, { routeBonus: routeBonusRef.current, driversHome: true, rivalsDone: true });
        if (done.state !== s) {
          gsRef.current = done.state;
          setGs(done.state);
          if (done.earned) onEarnRef.current(done.earned);
        }
        homeSinceRef.current = null;
      }
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Settings "force end day" button bumps forceEndSignal; end the day (no bonus) on change.
  const prevForceEndRef = useRef(forceEndSignal);
  useEffect(() => {
    if (forceEndSignal !== prevForceEndRef.current) {
      prevForceEndRef.current = forceEndSignal;
      forceEndDay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceEndSignal]);

  // A poach grows gs.converted; report the delta up so App can track the lifetime
  // "takeover" count (which discounts buyouts). converted resets to empty each new day,
  // so a shrink is ignored — only genuine poaches count toward the total.
  const convertedSizeRef = useRef(gs.converted.size);
  useEffect(() => {
    const delta = gs.converted.size - convertedSizeRef.current;
    convertedSizeRef.current = gs.converted.size;
    if (delta > 0) onPoachRef.current?.(delta);
  }, [gs.converted]);

  // Report YOUR delivered stops (collected grows) for the lifetime packages count. Resets
  // to 0 each new day (a shrink is ignored), so only genuine deliveries are counted.
  const collectedCountRef = useRef(gs.collected.size);
  useEffect(() => {
    const delta = gs.collected.size - collectedCountRef.current;
    collectedCountRef.current = gs.collected.size;
    if (delta > 0) onDeliverRef.current?.(delta);
  }, [gs.collected]);

  // Demand Engine bought mid-route: spawn the new delivery(s) on the CURRENT route
  // right away so DELIVERIES LEFT updates instantly (next-route counts already fold
  // in extraPackages via newRoute/startDay). Skips the initial mount for the loaded
  // value, and only fires on an increase — so it can't double-add.
  const prevExtraPackagesRef = useRef(extraPackages);
  useEffect(() => {
    const delta = extraPackages - prevExtraPackagesRef.current;
    prevExtraPackagesRef.current = extraPackages;
    if (delta <= 0 || gs.dayEnded) return;
    commit({ state: addPackages(gsRef.current, delta), earned: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraPackages]);

  // Map Expansion bought mid-route: grow the CURRENT route's grid LIVE so the map
  // gets bigger immediately (the canvas re-reads dims from gs.layout; autopilot/fleet
  // read the grown dims from gsRef each tick). Skips the initial mount for the loaded
  // value, only grows (never shrinks), and pauses on the day-end screen (the next day
  // already starts at the new size via startDay). Sets gs directly rather than via
  // commit() because the remap changes collected indices, which would trip its flash.
  const prevColsRef = useRef(cols);
  const prevRowsRef = useRef(rows);
  useEffect(() => {
    const grew = cols > prevColsRef.current || rows > prevRowsRef.current;
    prevColsRef.current = cols;
    prevRowsRef.current = rows;
    if (!grew || gsRef.current.dayEnded) return;
    const next = growState(gsRef.current, cols, rows, 0.9);
    gsRef.current = next;
    setGs(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows]);

  // Auto-Start Day: once owned, the day-end fade shows for a brief beat, then the
  // next day starts on its own (same commit as the Start Day button). Autopilot +
  // Fleet pause on day-end and resume once the new route lands, so it loops idle.
  useEffect(() => {
    if (!gs.dayEnded || !autoStartDay) return;
    const id = window.setTimeout(() => {
      commit({
        state: startDay(gsRef.current, {
          cols: colsRef.current,
          rows: rowsRef.current,
          packageCount: BASE_PACKAGES + extraPackagesRef.current,
          depotCount: depotCountRef.current,
          companyCount: companyCountRef.current,
          boughtCount: boughtCountRef.current,
          lockerPerRow: lockerPerRowRef.current,
        }),
        earned: 0,
      });
    }, Math.max(150, Math.round(900 / daySpeed)));
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.dayEnded, autoStartDay, daySpeed]);

  const { player, layout, visited, collected, converted, routes, dayEnded } = gs;
  const { blocked, specials, depots, cols: gcols, rows: grows } = layout;
  const reserved = layout.reserved ?? EMPTY_SET;
  const TOTAL = gcols * grows - blocked.size;
  // cell shrinks so the largest axis fills the fixed canvas ("zoom out")
  const cell = Math.floor(MAX_CANVAS_PX / Math.max(gcols, grows));
  // On very large maps the per-cell grid lines and visited shading are imperceptible
  // (cells are a few px) but cost thousands of draws — skip them to stay smooth.
  const detailed = Math.max(gcols, grows) <= 45;

  // ── grid-grow "zoom out" animation ──────────────────────────────────────────
  // A grow shrinks `cell`; instead of snapping, ease the on-screen cell from the
  // old (larger) size to the new (smaller) one over ~400ms. offX/offY/gridW/gridH
  // are all derived from the animated cell so the map shrinks-to-fit smoothly.
  // Offscreen cache of the STATIC layer (buildings + rival rings + frame): rebuilt only
  // when the map/scale changes, blitted each frame — so the thousands of blocked cells
  // aren't redrawn on every tick (the big late-game perf win).
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgKeyRef = useRef<{ blocked: unknown; reserved: unknown; colors: unknown; cell: number; offX: number; offY: number; w: number }>(
    { blocked: null, reserved: null, colors: null, cell: 0, offX: 0, offY: 0, w: 0 },
  );
  // cols×rows offscreen buffer: on huge maps the dynamic layer is drawn one pixel per
  // cell here (thousands of arcs/rects collapse to typed-array writes), then blitted scaled.
  const pixelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelImgRef = useRef<ImageData | null>(null); // reused each frame (fill(0), no realloc)
  const drawRef = useRef<(c: number) => void>(() => {});
  // Coalesce redraws to one per animation frame: state updates fire far faster than 60fps
  // (fleet/rival/drone ticks, per-van collects), and repainting on every one was wasteful.
  // scheduleDraw batches them so the canvas repaints at most once per frame.
  const drawScheduledRef = useRef(false);
  const scheduleDraw = () => {
    if (drawScheduledRef.current) return;
    drawScheduledRef.current = true;
    requestAnimationFrame(() => {
      drawScheduledRef.current = false;
      drawRef.current(animCellRef.current);
    });
  };
  const animRafRef = useRef(0);
  const prevCellRef = useRef(cell);   // last real cell — a drop means the grid grew
  const cellTargetRef = useRef(cell); // latest real cell = animation target
  cellTargetRef.current = cell;
  const animCellRef = useRef(cell);   // current on-screen (interpolated) cell
  const animFromRef = useRef(cell);   // cell size the current animation started at
  const animStartRef = useRef(0);
  useEffect(() => () => cancelAnimationFrame(animRafRef.current), []);

  // SFX on collect + route-complete, effect-based so Space, auto-deliver, fleet,
  // and autopilot all trigger it uniformly (they all flow through gs).
  const prevCollectedRef = useRef(collected.size);
  const prevSfxRoutesRef = useRef(routes);
  useEffect(() => {
    if (collected.size > prevCollectedRef.current) {
      // late game the chirp would machine-gun; throttle to ~1 per 50 deliveries
      if (!quietSfx || Math.floor(collected.size / 50) > Math.floor(prevCollectedRef.current / 50)) {
        playSfx("deliver");
      }
    }
    prevCollectedRef.current = collected.size;
  }, [collected]);
  useEffect(() => {
    if (routes > prevSfxRoutesRef.current) playSfx("route");
    prevSfxRoutesRef.current = routes;
  }, [routes]);

  // report headline stats up to the app HUD. capacity = cells that can hold one of
  // YOUR deliveries (open, non-depot) — caps how far Demand Engine can be bought.
  const capacity = TOTAL - depots.size - reserved.size;
  // fraction of the current rival territory you've poached (drives the buyout discount)
  let poachedInRes = 0;
  for (const c of converted) if (reserved.has(c)) poachedInRes++;
  const poachedFrac = reserved.size ? poachedInRes / reserved.size : 0;
  // deliveries you've completed THIS day so far (your stops + poached rival stops), live.
  const deliveredToday = collected.size + converted.size;
  // when a day completes, snapshot the cells driven that day (for the per-day Green Energy
  // figure) and reset the counter for the new day.
  const prevRoutesForCellsRef = useRef(routes);
  useEffect(() => {
    if (routes !== prevRoutesForCellsRef.current) {
      prevRoutesForCellsRef.current = routes;
      lastDayCellsRef.current = cellsTodayRef.current;
      cellsTodayRef.current = 0;
      droneTodayRef.current = 0;
    }
  }, [routes]);
  useEffect(() => {
    onStatsRef.current({
      packagesLeft: dayEnded ? 0 : specials.size - collected.size,
      mapPct: TOTAL > 0 ? Math.round((visited.size / TOTAL) * 100) : 0,
      routes,
      capacity,
      dayEnded,
      poachedFrac,
      deliveredToday,
      cellsPerDay: lastDayCellsRef.current,
      droneDeliveredToday: droneTodayRef.current,
    });
  }, [specials, collected, visited, TOTAL, routes, dayEnded, capacity, poachedFrac, deliveredToday]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    // full render at a given cell size; gridW/gridH derive from it so the frame
    // stays the fixed square while everything else scales with the (animated) cell.
    const draw = (cell: number, offX: number, offY: number) => {
    const gridW = gcols * cell;
    const gridH = grows * cell;

    const dot = Math.max(2, Math.round(cell * 0.13));

    // depot glyph: ink outline box + ⌂ (accent when armed).
    const drawDepot = (c: number, accent: boolean) => {
      const dX = offX + (c % gcols) * cell;
      const dY = offY + Math.floor(c / gcols) * cell;
      ctx.strokeStyle = accent ? ACCENT : INK;
      ctx.lineWidth = accent ? 3 : 1.5;
      ctx.strokeRect(dX + 2.5, dY + 2.5, cell - 5, cell - 5);
      ctx.fillStyle = accent ? ACCENT : INK;
      ctx.font = `${Math.round(cell / 3)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⌂", dX + cell / 2, dY + cell / 2 + 1);
      ctx.textAlign = "left";
    };

    // day over: the finished route fades to an empty grid — frame + depots only.
    if (dayEnded) {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, canvas, canvas);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, canvas - 1, canvas - 1);
      drawRegistration(ctx, offX, offY, gridW, gridH);
      for (const c of depots) drawDepot(c, false);
      return;
    }

    // ── STATIC layer (bg + frame + registration + buildings + rival rings) ──
    // Rebuilt on an offscreen canvas only when the map or scale changes; otherwise the
    // cached bitmap is just blitted, so thousands of cells aren't redrawn each frame.
    if (!bgCanvasRef.current) bgCanvasRef.current = document.createElement("canvas");
    const bg = bgCanvasRef.current;
    if (bg.width !== canvas) { bg.width = canvas; bg.height = canvas; }
    const k = bgKeyRef.current;
    if (k.blocked !== blocked || k.reserved !== reserved || k.colors !== rivalColors || k.cell !== cell || k.offX !== offX || k.offY !== offY || k.w !== canvas) {
      const b = bg.getContext("2d")!;
      b.clearRect(0, 0, canvas, canvas);
      b.fillStyle = BG;
      b.fillRect(0, 0, canvas, canvas);
      b.strokeStyle = INK;
      b.lineWidth = 1;
      b.strokeRect(0.5, 0.5, canvas - 1, canvas - 1);
      drawRegistration(b, offX, offY, gridW, gridH);
      b.fillStyle = INK;
      b.globalAlpha = 0.7;
      for (const c of blocked) {
        b.fillRect(offX + (c % gcols) * cell, offY + Math.floor(c / gcols) * cell, cell, cell);
      }
      b.globalAlpha = 1;
      b.lineWidth = 2;
      const centers = layout.rivalCenters ?? [];
      for (const c of reserved) {
        const cx = offX + (c % gcols) * cell + cell / 2;
        const cy = offY + Math.floor(c / gcols) * cell + cell / 2;
        b.beginPath();
        b.arc(cx, cy, dot, 0, Math.PI * 2);
        b.strokeStyle = cellColor(c, centers, gcols, rivalColors);
        b.stroke();
      }
      bgKeyRef.current = { blocked, reserved, colors: rivalColors, cell, offX, offY, w: canvas };
    }
    ctx.drawImage(bg, 0, 0);

    const armed = specials.size > 0 && collected.size === specials.size;
    const rivCenters = layout.rivalCenters ?? [];

    // On zoomed-out maps each cell is only a pixel or two; drawing thousands of arcs and
    // rects every frame is THE endgame bottleneck. Below this cell size, paint the whole
    // dynamic layer into a cols×rows pixel buffer (one typed-array write per cell) and blit
    // it scaled — a few thousand array writes + one drawImage instead of thousands of ctx ops.
    const pixelMode = cell <= 6;

    if (pixelMode) {
      const pw = gcols;
      const ph = grows;
      if (!pixelCanvasRef.current) pixelCanvasRef.current = document.createElement("canvas");
      const pc = pixelCanvasRef.current;
      if (pc.width !== pw || pc.height !== ph) { pc.width = pw; pc.height = ph; pixelImgRef.current = null; }
      const pctx = pc.getContext("2d")!;
      let img = pixelImgRef.current;
      if (!img) { img = pctx.createImageData(pw, ph); pixelImgRef.current = img; }
      const data = img.data;
      data.fill(0); // transparent; the cached static layer shows through untouched cells
      const put = (c: number, rgb: [number, number, number], a: number) => {
        const i = c * 4;
        data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = a;
      };
      const putXY = (x: number, y: number, rgb: [number, number, number], a: number) => {
        if (x < 0 || x >= pw || y < 0 || y >= ph) return;
        put(y * pw + x, rgb, a);
      };
      const accentRgb = hexToRgb(ACCENT);
      const rgbCache = new Map<string, [number, number, number]>();
      const rivalRgb = (c: number): [number, number, number] => {
        const hex = cellColor(c, rivCenters, gcols, rivalColors);
        let v = rgbCache.get(hex);
        if (!v) { v = hexToRgb(hex); rgbCache.set(hex, v); }
        return v;
      };
      // low -> high priority (later writes win over the same pixel)
      for (const c of visited) put(c, INK_RGB, 46);
      for (const c of specials) if (collected.has(c)) put(c, INK_RGB, 90);
      for (const c of rivalDone) put(c, rivalRgb(c), 150);
      for (const c of converted) put(c, accentRgb, 255);
      for (const c of specials) if (!collected.has(c)) put(c, accentRgb, 255);
      for (const c of depots) put(c, armed ? accentRgb : INK_RGB, 255);
      for (const v of vans) putXY(Math.round(v.dx), Math.round(v.dy), accentRgb, 255);
      for (const v of rivalVans) putXY(Math.round(v.x), Math.round(v.y), hexToRgb(v.color), 255);
      putXY(player.x, player.y, accentRgb, 255);
      pctx.putImageData(img, 0, 0);
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pc, offX, offY, gridW, gridH);
      ctx.imageSmoothingEnabled = prevSmooth;
      return;
    }

    // ── shape rendering (small/medium maps where individual cells are legible) ──
    // visited cells filled ink at ~18% alpha (coverage feedback — always drawn)
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.18;
    for (const c of visited) {
      const cx = c % gcols;
      const cy = Math.floor(c / gcols);
      ctx.fillRect(offX + cx * cell, offY + cy * cell, cell, cell);
    }
    ctx.globalAlpha = 1;

    // grid lines at ~15% ink alpha (skipped on huge maps)
    if (detailed) {
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1;
    for (let c = 0; c <= gcols; c++) {
      const x = offX + c * cell + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, offY);
      ctx.lineTo(x, offY + gridH);
      ctx.stroke();
    }
    for (let r = 0; r <= grows; r++) {
      const y = offY + r * cell + 0.5;
      ctx.beginPath();
      ctx.moveTo(offX, y);
      ctx.lineTo(offX + gridW, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    }

    // special stops: accent ring (uncollected) or dim filled dot (collected)
    for (const c of specials) {
      const cx = offX + (c % gcols) * cell + cell / 2;
      const cy = offY + Math.floor(c / gcols) * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, dot, 0, Math.PI * 2);
      if (collected.has(c)) {
        ctx.fillStyle = INK;
        ctx.globalAlpha = 0.35;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // every depot marked (ink outline box + ⌂ glyph); once all packages are
    // collected they arm and switch to an accent highlight (finish at any of them).
    for (const c of depots) drawDepot(c, armed);

    // A small ⌂ stamped on any van that's on its way back to a depot — so it's obvious
    // at a glance who's still delivering vs. who's heading home (what the day waits on).
    // Only drawn when cells are big enough for the glyph to read (tiny late-game pixels skip it).
    const homeGlyph = Math.round(cell * 0.5);
    const showHome = cell >= 12;
    const drawHome = (gx: number, gy: number) => {
      ctx.fillStyle = BG;
      ctx.font = `${homeGlyph}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⌂", offX + (gx + 0.5) * cell, offY + (gy + 0.5) * cell + 1);
      ctx.textAlign = "left";
    };

    // hired fleet = YOUR drivers: solid accent, just smaller than the main player so
    // it still reads as "you" (rivals are the blue ones). A van with no committed
    // package (target == null) is returning to its depot → stamp it with the home icon.
    const vinset = Math.round(cell * 0.25);
    for (const v of vans) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(
        offX + v.dx * cell + vinset,
        offY + v.dy * cell + vinset,
        cell - vinset * 2,
        cell - vinset * 2,
      );
      if (v.target == null && showHome) drawHome(v.dx, v.dy);
    }

    // (rival delivery-point rings are drawn in the cached static layer above)

    // serviced rival points fill in (a rival van has delivered there)
    for (const c of rivalDone) {
      const cx = offX + (c % gcols) * cell + cell / 2;
      const cy = offY + Math.floor(c / gcols) * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, dot, 0, Math.PI * 2);
      ctx.fillStyle = cellColor(c, rivCenters, gcols, rivalColors);
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // rival stops YOU poached: fill the ring solid in YOUR color — it's your delivery now
    ctx.fillStyle = ACCENT;
    for (const c of converted) {
      const cx = offX + (c % gcols) * cell + cell / 2;
      const cy = offY + Math.floor(c / gcols) * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, dot, 0, Math.PI * 2);
      ctx.fill();
    }

    // rival delivery vans: solid squares in their company color, driving in from offscreen.
    // Once they've delivered they head back offscreen (stage "out") → stamp the home icon.
    const rvi = Math.round(cell * 0.28);
    for (const v of rivalVans) {
      ctx.fillStyle = v.color;
      ctx.fillRect(offX + v.x * cell + rvi, offY + v.y * cell + rvi, cell - rvi * 2, cell - rvi * 2);
      if (v.stage === "out" && showHome) drawHome(v.x, v.y);
    }

    // player = solid accent square, slightly inset. Once armed (every package collected)
    // the only thing left is driving back to a depot → stamp the home icon here too.
    const inset = Math.round(cell * 0.125);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(
      offX + player.x * cell + inset,
      offY + player.y * cell + inset,
      cell - inset * 2,
      cell - inset * 2,
    );
    if (armed && showHome) drawHome(player.x, player.y);

    // brief accent pop when a special is collected
    if (flash !== null) {
      const fx = offX + (flash % gcols) * cell + cell / 2;
      const fy = offY + Math.floor(flash / gcols) * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(fx, fy, dot * 2, 0, Math.PI * 2);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    };

    // draw at cell `c`, centering the (possibly non-square) grid in the fixed square
    const drawAt = (c: number) =>
      draw(c, Math.floor((canvas - gcols * c) / 2), Math.floor((canvas - grows * c) / 2));
    drawRef.current = drawAt;

    const grew = cell < prevCellRef.current;
    prevCellRef.current = cell;

    if (grew) {
      if (animRafRef.current) {
        // rapid grow mid-animation (e.g. auto-buy spamming expansion): don't chase a
        // moving target — snap to the fitted size so the WHOLE map stays on screen.
        cancelAnimationFrame(animRafRef.current);
        animRafRef.current = 0;
        animCellRef.current = cell;
        drawAt(cell);
      } else {
        // ease from where we're visually at now → the new smaller target.
        animFromRef.current = animCellRef.current;
        animStartRef.current = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - animStartRef.current) / 400);
          const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
          animCellRef.current =
            animFromRef.current + (cellTargetRef.current - animFromRef.current) * e;
          drawRef.current(animCellRef.current);
          if (t < 1) {
            animRafRef.current = requestAnimationFrame(tick);
          } else {
            animRafRef.current = 0;
            animCellRef.current = cellTargetRef.current; // settle exactly on real cell
            drawRef.current(cellTargetRef.current);
          }
        };
        animRafRef.current = requestAnimationFrame(tick);
      }
    } else if (animRafRef.current) {
      // mid grow-animation: its rAF loop is already repainting every frame from the
      // freshly-set drawRef, so there's nothing extra to schedule here.
    } else {
      animCellRef.current = cell;
      scheduleDraw(); // coalesced: at most one repaint per frame no matter how many ticks
    }
  }, [player.x, player.y, visited, blocked, specials, depots, collected, converted, flash, routes, TOTAL, vans, reserved, rivalVans, rivalDone, rivalColors, gcols, grows, cell, dayEnded, canvas, ACCENT]);

  // begin the next day: fresh route with current dims + package count (upgrades applied)
  const beginDay = () =>
    commit({
      state: startDay(gsRef.current, {
        cols: colsRef.current,
        rows: rowsRef.current,
        packageCount: BASE_PACKAGES + extraPackagesRef.current,
        depotCount: depotCountRef.current,
        companyCount: companyCountRef.current,
        boughtCount: boughtCountRef.current,
        lockerPerRow: lockerPerRowRef.current,
      }),
      earned: 0,
    });
  beginDayRef.current = beginDay;

  return (
    // Canvas sits in a positioned box so the day-not-started controls (instructions +
    // Start Day) can overlay centered INSIDE the map instead of shifting layout below it.
    <div style={{ position: "relative", width: canvas, height: canvas }}>
      <canvas
        ref={canvasRef}
        width={canvas}
        height={canvas}
        style={{ transition: "opacity 0.7s ease-in-out", opacity: dayEnded ? 0.32 : 1, display: "block" }}
      />
      {/* Manual Start Day sits centered IN the box (auto-start hides it). */}
      {dayEnded && !autoStartDay && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Button label="Start Day (Space)" variant="primary" onClick={beginDay} />
        </div>
      )}
    </div>
  );
}
