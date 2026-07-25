import { useEffect, useRef, useState } from "react";
import { Stack } from "@astryxdesign/core/Stack";
import { Button } from "@astryxdesign/core/Button";
import {
  COLS,
  ROWS,
  CELL,
  PAD,
  START,
  idx,
  genLayout,
  type Layout,
} from "./gridLogic";
import {
  CASH_PER_STOP,
  ROUTE_BONUS,
  SPECIAL_BONUS,
  FULL_COVERAGE_BONUS,
  BASE_PACKAGES,
} from "./config";

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
  cashMult,
  extraPackages,
}: {
  onEarn: (delta: number) => void;
  onStats: (s: { packagesLeft: number; mapPct: number; routes: number }) => void;
  autoDeliver: boolean;
  cashMult: number;
  extraPackages: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [player, setPlayer] = useState({ x: 0, y: 0 });
  const [layout, setLayout] = useState<Layout>(genLayout);
  const [visited, setVisited] = useState<Set<number>>(() => new Set([START]));
  const [collected, setCollected] = useState<Set<number>>(() => new Set());
  const [flash, setFlash] = useState<number | null>(null);
  const [routes, setRoutes] = useState(0);
  const [fullBonusPaid, setFullBonusPaid] = useState(false);

  // ref so the keydown handler (bound once) always calls the latest onEarn
  const onEarnRef = useRef(onEarn);
  onEarnRef.current = onEarn;
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const autoDeliverRef = useRef(autoDeliver);
  autoDeliverRef.current = autoDeliver;
  const cashMultRef = useRef(cashMult);
  cashMultRef.current = cashMult;
  const extraPackagesRef = useRef(extraPackages);
  extraPackagesRef.current = extraPackages;
  // pay `base` cash scaled by the current Route Optimization multiplier
  const earn = (base: number) => onEarnRef.current(Math.round(base * cashMultRef.current));

  const { blocked, specials } = layout;
  const TOTAL = COLS * ROWS - blocked.size;

  // refs so the keydown handler always sees current state without re-binding
  const playerRef = useRef(player);
  playerRef.current = player;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const visitedRef = useRef(visited);
  visitedRef.current = visited;
  const specialsRef = useRef(specials);
  specialsRef.current = specials;
  const collectedRef = useRef(collected);
  collectedRef.current = collected;
  const fullBonusPaidRef = useRef(fullBonusPaid);
  fullBonusPaidRef.current = fullBonusPaid;

  const newLayout = () => {
    setLayout(genLayout(BASE_PACKAGES + extraPackagesRef.current));
    setPlayer({ x: 0, y: 0 });
    setVisited(new Set([START]));
    setCollected(new Set());
    setFullBonusPaid(false);
  };

  // one grid move in (dx,dy) — shared by the keydown handler and the snake tick.
  // returns false if the move was blocked/off-grid or ended the route (i.e. the
  // caller should stop rolling), true if the player actually advanced a cell.
  const step = (dx: number, dy: number): boolean => {
    const p = playerRef.current;
    const nx = p.x + dx;
    const ny = p.y + dy;
    // ignore moves off-grid or into a blocked building
    if (
      nx < 0 ||
      nx >= COLS ||
      ny < 0 ||
      ny >= ROWS ||
      blockedRef.current.has(idx(nx, ny))
    ) {
      return false;
    }
    const cellIdx = idx(nx, ny);
    // armed once every package is collected; returning to the depot finishes
    // the route — pay the bonus, bump the count, and roll a fresh layout
    const armed =
      specialsRef.current.size > 0 &&
      collectedRef.current.size === specialsRef.current.size;
    if (armed && cellIdx === START) {
      setRoutes((r) => r + 1);
      earn(ROUTE_BONUS);
      newLayout();
      return false;
    }
    setPlayer({ x: nx, y: ny });
    // movement-only income: pay once, the first time a cell is covered
    if (!visitedRef.current.has(cellIdx)) earn(CASH_PER_STOP);
    const nv = new Set(visitedRef.current).add(cellIdx);
    setVisited(nv);
    // optional one-time bonus for fully exploring the route (never ends the route)
    const total = COLS * ROWS - blockedRef.current.size;
    if (!fullBonusPaidRef.current && nv.size === total) {
      setFullBonusPaid(true);
      earn(FULL_COVERAGE_BONUS);
    }
    // auto-deliver: collect a package just by driving over it (no key press)
    if (
      autoDeliverRef.current &&
      specialsRef.current.has(cellIdx) &&
      !collectedRef.current.has(cellIdx)
    ) {
      earn(SPECIAL_BONUS);
      setFlash(cellIdx);
      window.setTimeout(() => setFlash(null), 200);
      setCollected(new Set(collectedRef.current).add(cellIdx));
    }
    return true;
  };
  // ref so the once-bound keydown handler / tick always call the latest step
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        // space: collect an uncollected special stop underfoot
        e.preventDefault();
        const p = playerRef.current;
        const cellIdx = idx(p.x, p.y);
        if (specialsRef.current.has(cellIdx) && !collectedRef.current.has(cellIdx)) {
          const nc = new Set(collectedRef.current).add(cellIdx);
          earn(SPECIAL_BONUS);
          setFlash(cellIdx);
          window.setTimeout(() => setFlash(null), 200);
          // collecting the last package only arms completion — driving back to
          // the depot finishes the route (handled in the movement branch below)
          setCollected(nc);
        }
        return;
      }
      const d = deltas[e.key];
      if (!d) return;
      e.preventDefault();
      stepRef.current(d[0], d[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      <Button label="Reset" onClick={newLayout} />
    </Stack>
  );
}
