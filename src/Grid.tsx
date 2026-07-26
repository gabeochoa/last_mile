import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { BASE_COLS, CELL, PAD, idx, bfsNextStep } from "./gridLogic";
import { addPackages, applyMove, collectAt, collectHere, finishIfDone, growState, newRoute, startDay, type GridState } from "./gridState";
import { BASE_PACKAGES } from "./config";
import { playSfx } from "./audio";

const BG = "#0F0F0F";
const INK = "#ECE7DA";
const RIVAL = "#4C86E8"; // rival delivery companies (blue), confined to expanded territory
const EMPTY_SET: Set<number> = new Set(); // stable empty fallback for optional layout.reserved

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
type RLayout = { reserved?: Set<number>; blocked: Set<number>; cols: number; rows: number };

// Deterministically map a cell to one of the rival company colors, so each company
// owns a scattered-but-stable set of cells.
const hashCell = (c: number) => (Math.imul(c + 1, 2654435761) >>> 0);
const cellColor = (c: number, colors: string[]) =>
  colors.length ? colors[hashCell(c) % colors.length] : RIVAL;

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

const RIVAL_SPEED = 0.3; // cells per tick — the van SLIDES toward its next cell

const spawnRivalVan = (layout: RLayout, colors: string[]): RivalVan | null => {
  const res = layout.reserved ? [...layout.reserved] : [];
  const border = borderEntries(layout);
  if (!res.length || !border.length) return null;
  const cell = res[Math.floor(Math.random() * res.length)];
  const [bx, by, ox, oy] = border[Math.floor(Math.random() * border.length)];
  // start just offscreen by an OPEN border cell; goal = the rival point (its company color)
  return {
    x: bx + ox, y: by + oy, tx: bx, ty: by, gx: cell % layout.cols, gy: Math.floor(cell / layout.cols),
    stage: "in", wait: 0, color: cellColor(cell, colors),
  };
};

// Ease the van toward its immediate target cell; when it arrives, pick the next cell
// along a wall-avoiding path to its goal (the rival point, then back offscreen).
const stepRivalVan = (v: RivalVan, layout: RLayout, colors: string[]): RivalVan => {
  const { cols, rows, blocked } = layout;
  const onGrid = (x: number, y: number) => x >= 0 && x < cols && y >= 0 && y < rows;
  const open = (x: number, y: number) => !onGrid(x, y) || !blocked.has(idx(x, y, cols));

  // still sliding toward the current target cell
  const dx = v.tx - v.x;
  const dy = v.ty - v.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.02) {
    const s = Math.min(d, RIVAL_SPEED);
    return { ...v, x: v.x + (dx / d) * s, y: v.y + (dy / d) * s };
  }

  // arrived at a cell — snap and decide the next one
  const cx = v.tx;
  const cy = v.ty;
  const van = { ...v, x: cx, y: cy };
  if (van.stage === "out" && !onGrid(cx, cy)) return spawnRivalVan(layout, colors) ?? van; // left the map
  if (van.stage === "in" && cx === van.gx && cy === van.gy) {
    // delivered: turn around and head back out the nearest edge, pausing a beat
    return { ...van, stage: "out", wait: 5, gx: cx < cols / 2 ? -1 : cols, gy: cy };
  }
  if (van.wait > 0) return { ...van, wait: van.wait - 1 };
  // next cell toward the goal: BFS around walls on-grid, else straight (never into a wall)
  let nx = cx;
  let ny = cy;
  if (onGrid(cx, cy) && onGrid(van.gx, van.gy)) {
    const dir = bfsNextStep(blocked, idx(cx, cy, cols), idx(van.gx, van.gy, cols), cols, rows);
    if (dir) { nx = cx + dir[0]; ny = cy + dir[1]; }
  } else {
    const sx = Math.sign(van.gx - cx);
    const sy = Math.sign(van.gy - cy);
    if (sx !== 0 && open(cx + sx, cy)) nx = cx + sx;
    else if (sy !== 0 && open(cx, cy + sy)) ny = cy + sy;
  }
  return { ...van, tx: nx, ty: ny };
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
  autoDeliver,
  autopilot,
  fleet,
  vanSpeed,
  daySpeed,
  perDelivery,
  routeBonus,
  extraPackages,
  depotCount,
  autoStartDay,
  rivalFraction,
  rivalColors,
  accent,
  cols,
  rows,
  initialRoutes = 0,
}: {
  onEarn: (delta: number) => void;
  onStats: (s: { packagesLeft: number; mapPct: number; routes: number; capacity: number; dayEnded: boolean }) => void;
  autoDeliver: boolean;
  autopilot: boolean;
  fleet: number;
  vanSpeed: number;
  daySpeed: number;
  perDelivery: number;
  routeBonus: number;
  extraPackages: number;
  depotCount: number;
  autoStartDay: boolean;
  // fraction (0..1) of the expansion frontier held by rivals; buying them out lowers it
  rivalFraction: number;
  // one color per rival company (a new company every 10 expansions); cells/vans colored by company
  rivalColors: string[];
  // player's brand color; drives the player, fleet, packages and armed-depot glyphs
  accent: string;
  cols: number;
  rows: number;
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
    newRoute(cols, rows, BASE_PACKAGES + extraPackages, depotCount, initialRoutes, undefined, rivalFraction),
  );
  const [flash, setFlash] = useState<number | null>(null);
  // hired fleet vans: {x,y} + their HOME depot cell, driven by the fleet tick
  // (ref-mirrored). Van i homes to the i-th depot (round-robin over sorted depots).
  const [vans, setVans] = useState<{ x: number; y: number; home: number }[]>([]);
  const vansRef = useRef(vans);
  vansRef.current = vans;
  const rivalFractionRef = useRef(rivalFraction);
  rivalFractionRef.current = rivalFraction;
  const rivalColorsRef = useRef(rivalColors);
  rivalColorsRef.current = rivalColors;
  // blue rival delivery vans driving in from offscreen to service rival points (cosmetic)
  const [rivalVans, setRivalVans] = useState<RivalVan[]>([]);

  // refs so the once-bound keydown handler always sees latest state/props without
  // re-binding — and gsRef updates SYNCHRONOUSLY so rapid/held keys can't re-enter
  const gsRef = useRef(gs);
  gsRef.current = gs;
  // latest beginDay(), so the once-bound keydown handler can start the day on Space
  const beginDayRef = useRef<() => void>(() => {});
  const onEarnRef = useRef(onEarn);
  onEarnRef.current = onEarn;
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
        commit(collectHere(gsRef.current, { perDelivery: perDeliveryRef.current }));
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
      });
      if (fin.state !== s) {
        commit(fin);
        return;
      }
      const { cols: gcols, rows: grows } = s.layout;
      const here = idx(s.player.x, s.player.y, gcols);
      const left = [...s.layout.specials].filter((c) => !s.collected.has(c));
      const dist = (c: number) =>
        Math.abs((c % gcols) - s.player.x) + Math.abs(Math.floor(c / gcols) - s.player.y);
      // ponytail: Manhattan picks the target package; bfsNextStep still routes
      // around walls. Swap for a BFS-distance nearest if a wall makes it dither.
      // Once armed, finish at whichever depot is nearest (any depot completes).
      const target = left.length
        ? left.reduce((a, b) => (dist(b) < dist(a) ? b : a))
        : [...s.layout.depots].reduce((a, b) => (dist(b) < dist(a) ? b : a));
      const dir = bfsNextStep(s.layout.blocked, here, target, gcols, grows);
      if (!dir) return;
      commit(applyMove(gsRef.current, dir[0], dir[1], { ...moveOpts(), autoDeliver: true }));
    }, Math.max(40, Math.round(340 / vanSpeed)));
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilot, vanSpeed]);

  // Keep the van array sized to `fleet` with each van spawned AT its home depot.
  // Van i homes to the i-th sorted depot (round-robin). A new layout (new route or
  // live grow) re-homes every van; growing `fleet` only appends new vans at homes.
  const prevLayoutRef = useRef(gs.layout);
  useEffect(() => {
    const layoutChanged = prevLayoutRef.current !== gs.layout;
    prevLayoutRef.current = gs.layout;
    const { cols: gcols } = gs.layout;
    const sortedDepots = [...gs.layout.depots].sort((a, b) => a - b);
    const mkVan = (i: number) => {
      const home = sortedDepots[i % sortedDepots.length];
      return { x: home % gcols, y: Math.floor(home / gcols), home };
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
  }, [fleet, gs.layout]);

  // Fleet tick: slower than autopilot. Vans fan out — each claims its nearest
  // still-unclaimed uncollected package (claimed per tick so no two share a
  // target); surplus vans (more vans than packages) head home to the depot.
  // Each steps one cell and collects on arrival via collectAt — updating the
  // shared route so completion arms + cash is paid. Vans never complete routes;
  // only the main van reaching the depot does.
  useEffect(() => {
    if (fleet <= 0) return;
    const id = window.setInterval(() => {
      if (gsRef.current.dayEnded) return; // pause the fleet on the day-end screen
      const { layout } = gsRef.current;
      const { cols: gcols, rows: grows } = layout;
      const claimed = new Set<number>();
      const next = vansRef.current.map((van) => {
        const from = idx(van.x, van.y, gcols);
        const dist = (c: number) =>
          Math.abs((c % gcols) - van.x) + Math.abs(Math.floor(c / gcols) - van.y);
        const avail = [...layout.specials].filter(
          (c) => !gsRef.current.collected.has(c) && !claimed.has(c),
        );
        // claim a package if any remain; else head back to this van's HOME depot
        const target = avail.length ? avail.reduce((a, b) => (dist(b) < dist(a) ? b : a)) : van.home;
        if (avail.length) claimed.add(target);
        const dir = bfsNextStep(layout.blocked, from, target, gcols, grows);
        if (!dir) return van;
        const nv = { x: van.x + dir[0], y: van.y + dir[1], home: van.home };
        const { state, earned } = collectAt(gsRef.current, idx(nv.x, nv.y, gcols), {
          perDelivery: perDeliveryRef.current,
        });
        if (earned) {
          gsRef.current = state;
          setGs(state);
          onEarnRef.current(earned);
        }
        return nv;
      });
      vansRef.current = next;
      setVans(next);
      // fleet may have just delivered the last package and/or driven the last van home
      // while the player idles on a depot; end the day once everyone's back.
      const done = finishIfDone(gsRef.current, {
        routeBonus: routeBonusRef.current,
        driversHome: allDriversHome(gsRef.current.layout, next),
      });
      if (done.state !== gsRef.current) {
        gsRef.current = done.state;
        setGs(done.state);
        if (done.earned) onEarnRef.current(done.earned);
      }
    }, Math.max(60, Math.round(340 / vanSpeed)));
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet, vanSpeed]);

  // Keep a few rival delivery vans alive whenever rival points exist; re-seed on a
  // new layout. They drive in from offscreen, service a point, and drive back out.
  useEffect(() => {
    const count = gs.layout.reserved ? Math.min(gs.layout.reserved.size, 12) : 0;
    setRivalVans(
      Array.from({ length: count }, () => spawnRivalVan(gs.layout, rivalColorsRef.current)).filter(
        (v): v is RivalVan => v !== null,
      ),
    );
  }, [gs.layout]);

  useEffect(() => {
    if (!gs.layout.reserved?.size) return;
    const id = window.setInterval(() => {
      setRivalVans((vs) => vs.map((v) => stepRivalVan(v, gsRef.current.layout, rivalColorsRef.current)));
    }, 55);
    return () => window.clearInterval(id);
  }, [gs.layout]);

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
    const next = growState(gsRef.current, cols, rows, rivalFractionRef.current);
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
          rivalFraction: rivalFractionRef.current,
        }),
        earned: 0,
      });
    }, Math.max(150, Math.round(900 / daySpeed)));
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.dayEnded, autoStartDay, daySpeed]);

  const { player, layout, visited, collected, routes, dayEnded } = gs;
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
  const drawRef = useRef<(c: number) => void>(() => {});
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
    if (collected.size > prevCollectedRef.current) playSfx("deliver");
    prevCollectedRef.current = collected.size;
  }, [collected]);
  useEffect(() => {
    if (routes > prevSfxRoutesRef.current) playSfx("route");
    prevSfxRoutesRef.current = routes;
  }, [routes]);

  // report headline stats up to the app HUD. capacity = cells that can hold one of
  // YOUR deliveries (open, non-depot) — caps how far Demand Engine can be bought.
  const capacity = TOTAL - depots.size - reserved.size;
  useEffect(() => {
    onStatsRef.current({
      packagesLeft: dayEnded ? 0 : specials.size - collected.size,
      mapPct: TOTAL > 0 ? Math.round((visited.size / TOTAL) * 100) : 0,
      routes,
      capacity,
      dayEnded,
    });
  }, [specials, collected, visited, TOTAL, routes, dayEnded, capacity]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    // full render at a given cell size; gridW/gridH derive from it so the frame
    // stays the fixed square while everything else scales with the (animated) cell.
    const draw = (cell: number, offX: number, offY: number) => {
    const gridW = gcols * cell;
    const gridH = grows * cell;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas, canvas);

    // thin 1px frame hugging the fixed square canvas (grid is centered within)
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, canvas - 1, canvas - 1);

    drawRegistration(ctx, offX, offY, gridW, gridH);

    // depot glyph: ink outline box + ⌂ (accent when armed). Shared by the day-end
    // screen and the live render so every warehouse draws the same.
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

    // day over: the finished route fades to an empty grid — frame, registration
    // marks and the depots only (no packages/visited/vans/player) until Start Day.
    if (dayEnded) {
      for (const c of depots) drawDepot(c, false);
      return;
    }

    // blocked buildings = solid ink at ~70% alpha
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.7;
    for (const c of blocked) {
      const bx = c % gcols;
      const by = Math.floor(c / gcols);
      ctx.fillRect(offX + bx * cell, offY + by * cell, cell, cell);
    }
    ctx.globalAlpha = 1;

    // visited cells filled ink at ~18% alpha (skipped on huge maps)
    if (detailed) {
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.18;
    for (const c of visited) {
      const cx = c % gcols;
      const cy = Math.floor(c / gcols);
      ctx.fillRect(offX + cx * cell, offY + cy * cell, cell, cell);
    }
    ctx.globalAlpha = 1;
    }

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
    const dot = Math.max(4, Math.round(cell * 0.15));
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
    const armed = specials.size > 0 && collected.size === specials.size;
    for (const c of depots) drawDepot(c, armed);

    // hired fleet = YOUR drivers: solid accent, just smaller than the main player so
    // it still reads as "you" (rivals are the blue ones).
    ctx.fillStyle = ACCENT;
    const vinset = Math.round(cell * 0.25);
    for (const v of vans) {
      ctx.fillRect(
        offX + v.x * cell + vinset,
        offY + v.y * cell + vinset,
        cell - vinset * 2,
        cell - vinset * 2,
      );
    }

    // rival delivery points: rings in each owning company's color (not yours until bought out)
    ctx.lineWidth = 2;
    for (const c of reserved) {
      const cx = offX + (c % gcols) * cell + cell / 2;
      const cy = offY + Math.floor(c / gcols) * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, dot, 0, Math.PI * 2);
      ctx.strokeStyle = cellColor(c, rivalColors);
      ctx.stroke();
    }

    // rival delivery vans: solid squares in their company color, driving in from offscreen
    const rvi = Math.round(cell * 0.28);
    for (const v of rivalVans) {
      ctx.fillStyle = v.color;
      ctx.fillRect(offX + v.x * cell + rvi, offY + v.y * cell + rvi, cell - rvi * 2, cell - rvi * 2);
    }

    // player = solid accent square, slightly inset
    const inset = Math.round(cell * 0.125);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(
      offX + player.x * cell + inset,
      offY + player.y * cell + inset,
      cell - inset * 2,
      cell - inset * 2,
    );

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
      // mid-animation state change: reflect it now at the current scale; the rAF
      // loop keeps easing through the freshly-set drawRef.
      drawAt(animCellRef.current);
    } else {
      animCellRef.current = cell;
      drawAt(cell);
    }
  }, [player.x, player.y, visited, blocked, specials, depots, collected, flash, routes, TOTAL, vans, reserved, rivalVans, rivalColors, gcols, grows, cell, dayEnded, canvas, ACCENT]);

  // begin the next day: fresh route with current dims + package count (upgrades applied)
  const beginDay = () =>
    commit({
      state: startDay(gsRef.current, {
        cols: colsRef.current,
        rows: rowsRef.current,
        packageCount: BASE_PACKAGES + extraPackagesRef.current,
        depotCount: depotCountRef.current,
        rivalFraction: rivalFractionRef.current,
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
        style={{ transition: "opacity 0.35s ease", opacity: dayEnded ? 0.55 : 1, display: "block" }}
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
