import { useEffect, useRef, useState } from "react";
import { Stack } from "@astryxdesign/core/Stack";
import { Button } from "@astryxdesign/core/Button";
import { COLS, ROWS, CELL, PAD, START, idx, bfsNextStep } from "./gridLogic";
import { applyMove, collectHere, newRoute, type GridState } from "./gridState";
import { BASE_PACKAGES } from "./config";

const BG = "#0F0F0F";
const INK = "#ECE7DA";
const ACCENT = "#E8541E";

const FOOTER = 8;
const GRID_H = ROWS * CELL;
const WIDTH = COLS * CELL + PAD * 2;
const HEIGHT = GRID_H + PAD * 2 + FOOTER;

function drawRegistration(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  const arm = 5;
  const marks: [number, number][] = [
    [PAD, PAD],
    [WIDTH - PAD, PAD],
    [PAD, PAD + GRID_H],
    [WIDTH - PAD, PAD + GRID_H],
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
  cashMult,
  extraPackages,
}: {
  onEarn: (delta: number) => void;
  onStats: (s: { packagesLeft: number; mapPct: number; routes: number }) => void;
  autoDeliver: boolean;
  autopilot: boolean;
  cashMult: number;
  extraPackages: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // single source of truth for the route; pure applyMove/collectHere produce the next one
  const [gs, setGs] = useState<GridState>(() => newRoute(BASE_PACKAGES + extraPackages));
  const [flash, setFlash] = useState<number | null>(null);

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
  const cashMultRef = useRef(cashMult);
  cashMultRef.current = cashMult;
  const extraPackagesRef = useRef(extraPackages);
  extraPackagesRef.current = extraPackages;

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

  const reset = () =>
    commit({
      state: newRoute(BASE_PACKAGES + extraPackagesRef.current, gsRef.current.routes),
      earned: 0,
    });

  useEffect(() => {
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        commit(collectHere(gsRef.current, { cashMult: cashMultRef.current }));
        return;
      }
      const d = deltas[e.key];
      if (!d) return;
      e.preventDefault();
      commit(
        applyMove(gsRef.current, d[0], d[1], {
          autoDeliver: autoDeliverRef.current,
          cashMult: cashMultRef.current,
          packageCount: BASE_PACKAGES + extraPackagesRef.current,
        }),
      );
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
      const here = idx(s.player.x, s.player.y);
      const left = [...s.layout.specials].filter((c) => !s.collected.has(c));
      const dist = (c: number) =>
        Math.abs((c % COLS) - s.player.x) + Math.abs(Math.floor(c / COLS) - s.player.y);
      // ponytail: Manhattan picks the target package; bfsNextStep still routes
      // around walls. Swap for a BFS-distance nearest if a wall makes it dither.
      const target = left.length
        ? left.reduce((a, b) => (dist(b) < dist(a) ? b : a))
        : START;
      const dir = bfsNextStep(s.layout.blocked, here, target);
      if (!dir) return;
      commit(
        applyMove(gsRef.current, dir[0], dir[1], {
          autoDeliver: true,
          cashMult: cashMultRef.current,
          packageCount: BASE_PACKAGES + extraPackagesRef.current,
        }),
      );
    }, 150);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilot]);

  const { player, layout, visited, collected, routes } = gs;
  const { blocked, specials } = layout;
  const TOTAL = COLS * ROWS - blocked.size;

  // report headline stats up to the app HUD
  useEffect(() => {
    onStatsRef.current({
      packagesLeft: specials.size - collected.size,
      mapPct: TOTAL > 0 ? Math.round((visited.size / TOTAL) * 100) : 0,
      routes,
    });
  }, [specials, collected, visited, TOTAL, routes]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // thin 1px frame
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, WIDTH - 1, HEIGHT - 1);

    drawRegistration(ctx);

    // blocked buildings = solid ink at ~70% alpha
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.7;
    for (const cell of blocked) {
      const bx = cell % COLS;
      const by = Math.floor(cell / COLS);
      ctx.fillRect(PAD + bx * CELL, PAD + by * CELL, CELL, CELL);
    }
    ctx.globalAlpha = 1;

    // visited cells filled ink at ~18% alpha
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.18;
    for (const cell of visited) {
      const cx = cell % COLS;
      const cy = Math.floor(cell / COLS);
      ctx.fillRect(PAD + cx * CELL, PAD + cy * CELL, CELL, CELL);
    }
    ctx.globalAlpha = 1;

    // grid lines at ~15% ink alpha
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      const x = PAD + c * CELL + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, PAD);
      ctx.lineTo(x, PAD + ROWS * CELL);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      const y = PAD + r * CELL + 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD, y);
      ctx.lineTo(PAD + COLS * CELL, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // special stops: accent ring (uncollected) or dim filled dot (collected)
    for (const cell of specials) {
      const cx = PAD + (cell % COLS) * CELL + CELL / 2;
      const cy = PAD + Math.floor(cell / COLS) * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      if (collected.has(cell)) {
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
    const depotX = PAD + (START % COLS) * CELL;
    const depotY = PAD + Math.floor(START / COLS) * CELL;
    ctx.strokeStyle = armed ? ACCENT : INK;
    ctx.lineWidth = armed ? 3 : 1.5;
    ctx.strokeRect(depotX + 2.5, depotY + 2.5, CELL - 5, CELL - 5);
    ctx.fillStyle = armed ? ACCENT : INK;
    ctx.font = "16px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⌂", depotX + CELL / 2, depotY + CELL / 2 + 1);
    ctx.textAlign = "left";

    // player = solid accent square, slightly inset
    const inset = 6;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(
      PAD + player.x * CELL + inset,
      PAD + player.y * CELL + inset,
      CELL - inset * 2,
      CELL - inset * 2,
    );

    // brief accent pop when a special is collected
    if (flash !== null) {
      const fx = PAD + (flash % COLS) * CELL + CELL / 2;
      const fy = PAD + Math.floor(flash / COLS) * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(fx, fy, 14, 0, Math.PI * 2);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [player.x, player.y, visited, blocked, specials, collected, flash, routes, TOTAL]);

  return (
    <Stack direction="vertical" gap={4}>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
      <Button label="Reset" onClick={reset} />
    </Stack>
  );
}
