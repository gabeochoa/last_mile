import { useEffect, useRef, useState } from "react";
import { Stack } from "@astryxdesign/core/Stack";
import { Button } from "@astryxdesign/core/Button";
import { BASE_COLS, CELL, PAD, START, idx, bfsNextStep } from "./gridLogic";
import { applyMove, collectAt, collectHere, newRoute, startDay, type GridState } from "./gridState";
import { BASE_PACKAGES } from "./config";
import { playSfx } from "./audio";

const BG = "#0F0F0F";
const INK = "#ECE7DA";
const ACCENT = "#E8541E";

// Canvas is a FIXED SQUARE (the old 6×48 grid + padding); cells shrink and the
// grid is centered as the map grows, so the layout never jumps.
const MAX_CANVAS_PX = BASE_COLS * CELL;
const CANVAS = MAX_CANVAS_PX + PAD * 2;

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
  cashMult,
  extraPackages,
  cols,
  rows,
  initialRoutes = 0,
}: {
  onEarn: (delta: number) => void;
  onStats: (s: { packagesLeft: number; mapPct: number; routes: number }) => void;
  autoDeliver: boolean;
  autopilot: boolean;
  fleet: number;
  cashMult: number;
  extraPackages: number;
  cols: number;
  rows: number;
  initialRoutes?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // single source of truth for the route; pure applyMove/collectHere produce the next one.
  // The route layout starts fresh on load; only the resumed `routes` count carries over.
  const [gs, setGs] = useState<GridState>(() =>
    newRoute(cols, rows, BASE_PACKAGES + extraPackages, initialRoutes),
  );
  const [flash, setFlash] = useState<number | null>(null);
  // hired fleet vans: {x,y} per van, driven by the fleet tick (ref-mirrored)
  const [vans, setVans] = useState<{ x: number; y: number }[]>([]);
  const vansRef = useRef(vans);
  vansRef.current = vans;

  // refs so the once-bound keydown handler always sees latest state/props without
  // re-binding — and gsRef updates SYNCHRONOUSLY so rapid/held keys can't re-enter
  const gsRef = useRef(gs);
  gsRef.current = gs;
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
  const cashMultRef = useRef(cashMult);
  cashMultRef.current = cashMult;
  const extraPackagesRef = useRef(extraPackages);
  extraPackagesRef.current = extraPackages;
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
    cashMult: cashMultRef.current,
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
      if (gsRef.current.dayEnded) return; // day over: input frozen until Start Day
      if (e.key === " ") {
        e.preventDefault();
        commit(collectHere(gsRef.current, { cashMult: cashMultRef.current }));
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
      const { cols: gcols, rows: grows } = s.layout;
      const here = idx(s.player.x, s.player.y, gcols);
      const left = [...s.layout.specials].filter((c) => !s.collected.has(c));
      const dist = (c: number) =>
        Math.abs((c % gcols) - s.player.x) + Math.abs(Math.floor(c / gcols) - s.player.y);
      // ponytail: Manhattan picks the target package; bfsNextStep still routes
      // around walls. Swap for a BFS-distance nearest if a wall makes it dither.
      const target = left.length
        ? left.reduce((a, b) => (dist(b) < dist(a) ? b : a))
        : START;
      const dir = bfsNextStep(s.layout.blocked, here, target, gcols, grows);
      if (!dir) return;
      commit(applyMove(gsRef.current, dir[0], dir[1], { ...moveOpts(), autoDeliver: true }));
    }, 150);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilot]);

  // Keep the van array sized to `fleet` (new vans spawn at the depot), and reset
  // all vans home whenever a route completes (gs.routes ticks up).
  const prevRoutesRef = useRef(gs.routes);
  useEffect(() => {
    const routeChanged = prevRoutesRef.current !== gs.routes;
    prevRoutesRef.current = gs.routes;
    setVans((prev) => {
      if (routeChanged || prev.length > fleet) {
        return Array.from({ length: fleet }, () => ({ x: 0, y: 0 }));
      }
      if (prev.length < fleet) {
        return [...prev, ...Array.from({ length: fleet - prev.length }, () => ({ x: 0, y: 0 }))];
      }
      return prev;
    });
  }, [fleet, gs.routes]);

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
        const target = avail.length ? avail.reduce((a, b) => (dist(b) < dist(a) ? b : a)) : START;
        if (target !== START) claimed.add(target);
        const dir = bfsNextStep(layout.blocked, from, target, gcols, grows);
        if (!dir) return van;
        const nv = { x: van.x + dir[0], y: van.y + dir[1] };
        const { state, earned } = collectAt(gsRef.current, idx(nv.x, nv.y, gcols), {
          cashMult: cashMultRef.current,
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
    }, 220);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet]);

  const { player, layout, visited, collected, routes, dayEnded } = gs;
  const { blocked, specials, cols: gcols, rows: grows } = layout;
  const TOTAL = gcols * grows - blocked.size;
  // cell shrinks so the largest axis fills the fixed canvas ("zoom out")
  const cell = Math.floor(MAX_CANVAS_PX / Math.max(gcols, grows));
  const gridW = gcols * cell;
  const gridH = grows * cell;
  // center the (possibly non-square) grid within the fixed square canvas
  const offX = Math.floor((CANVAS - gridW) / 2);
  const offY = Math.floor((CANVAS - gridH) / 2);

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

  // report headline stats up to the app HUD
  useEffect(() => {
    onStatsRef.current({
      packagesLeft: dayEnded ? 0 : specials.size - collected.size,
      mapPct: TOTAL > 0 ? Math.round((visited.size / TOTAL) * 100) : 0,
      routes,
    });
  }, [specials, collected, visited, TOTAL, routes, dayEnded]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, CANVAS, CANVAS);

    // thin 1px frame hugging the fixed square canvas (grid is centered within)
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, CANVAS - 1, CANVAS - 1);

    drawRegistration(ctx, offX, offY, gridW, gridH);

    // day over: the finished route fades to an empty grid — frame, registration
    // marks and the depot only (no packages/visited/vans/player) until Start Day.
    if (dayEnded) {
      const dX = offX + (START % gcols) * cell;
      const dY = offY + Math.floor(START / gcols) * cell;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(dX + 2.5, dY + 2.5, cell - 5, cell - 5);
      ctx.fillStyle = INK;
      ctx.font = `${Math.round(cell / 3)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⌂", dX + cell / 2, dY + cell / 2 + 1);
      ctx.textAlign = "left";
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

    // visited cells filled ink at ~18% alpha
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.18;
    for (const c of visited) {
      const cx = c % gcols;
      const cy = Math.floor(c / gcols);
      ctx.fillRect(offX + cx * cell, offY + cy * cell, cell, cell);
    }
    ctx.globalAlpha = 1;

    // grid lines at ~15% ink alpha
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

    // depot at the start cell: always marked (ink outline box + ⌂ glyph);
    // once every package is collected it arms and switches to an accent highlight
    const armed = specials.size > 0 && collected.size === specials.size;
    const depotX = offX + (START % gcols) * cell;
    const depotY = offY + Math.floor(START / gcols) * cell;
    ctx.strokeStyle = armed ? ACCENT : INK;
    ctx.lineWidth = armed ? 3 : 1.5;
    ctx.strokeRect(depotX + 2.5, depotY + 2.5, cell - 5, cell - 5);
    ctx.fillStyle = armed ? ACCENT : INK;
    ctx.font = `${Math.round(cell / 3)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⌂", depotX + cell / 2, depotY + cell / 2 + 1);
    ctx.textAlign = "left";

    // hired fleet vans: smaller, dimmer ink squares so the orange player stays "you"
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.6;
    const vinset = Math.round(cell * 0.25);
    for (const v of vans) {
      ctx.fillRect(
        offX + v.x * cell + vinset,
        offY + v.y * cell + vinset,
        cell - vinset * 2,
        cell - vinset * 2,
      );
    }
    ctx.globalAlpha = 1;

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
  }, [player.x, player.y, visited, blocked, specials, collected, flash, routes, TOTAL, vans, gcols, grows, cell, gridW, gridH, offX, offY, dayEnded]);

  // begin the next day: fresh route with current dims + package count (upgrades applied)
  const beginDay = () =>
    commit({
      state: startDay(gsRef.current, {
        cols: colsRef.current,
        rows: rowsRef.current,
        packageCount: BASE_PACKAGES + extraPackagesRef.current,
      }),
      earned: 0,
    });

  return (
    <Stack direction="vertical" gap={4}>
      <canvas
        ref={canvasRef}
        width={CANVAS}
        height={CANVAS}
        style={{ transition: "opacity 0.35s ease", opacity: dayEnded ? 0.55 : 1 }}
      />
      {dayEnded && <Button label="Start Day" variant="primary" onClick={beginDay} />}
    </Stack>
  );
}
