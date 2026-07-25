import { useEffect, useRef, useState } from "react";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";

const COLS = 6;
const ROWS = 6;
const CELL = 48;
const PAD = 16;

const BG = "#0F0F0F";
const INK = "#ECE7DA";
const ACCENT = "#E8541E";

const CASH_PER_STOP = 1;
const ROUTE_BONUS = 25;
const SPECIAL_BONUS = 10;
const FULL_COVERAGE_BONUS = 50; // one-time, for covering every reachable cell in a route

const FOOTER = 44; // two label rows
const GRID_H = ROWS * CELL;
const WIDTH = COLS * CELL + PAD * 2;
const HEIGHT = GRID_H + PAD * 2 + FOOTER;

const idx = (x: number, y: number) => y * COLS + x;
const START = idx(0, 0);
const pad3 = (n: number) => String(n).padStart(3, "0");

// BFS from START over non-blocked cells; true only if every open cell is reachable
function allReachable(blocked: Set<number>): boolean {
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

// 4-6 packages on random open (non-blocked, non-start) cells — these are the objective
function genSpecials(blocked: Set<number>): Set<number> {
  const open: number[] = [];
  for (let c = 0; c < COLS * ROWS; c++) {
    if (c !== START && !blocked.has(c)) open.push(c);
  }
  const specials = new Set<number>();
  const count = Math.min(open.length, 4 + Math.floor(Math.random() * 3)); // 4-6
  while (specials.size < count) {
    specials.add(open[Math.floor(Math.random() * open.length)]);
  }
  return specials;
}

type Layout = { blocked: Set<number>; specials: Set<number> };

// fresh random layout: 6-9 blocked cells (never START), guaranteed fully reachable
function genLayout(): Layout {
  for (let attempt = 0; attempt < 50; attempt++) {
    const blocked = new Set<number>();
    const count = 6 + Math.floor(Math.random() * 4); // 6-9
    while (blocked.size < count) {
      const c = Math.floor(Math.random() * COLS * ROWS);
      if (c !== START) blocked.add(c);
    }
    if (allReachable(blocked)) return { blocked, specials: genSpecials(blocked) };
  }
  const blocked = new Set<number>(); // fallback: no blocked cells is trivially reachable
  return { blocked, specials: genSpecials(blocked) };
}

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
  cash,
  onEarn,
  snakeEnabled,
}: {
  cash: number;
  onEarn: (delta: number) => void;
  snakeEnabled: boolean;
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
  // mirror snakeEnabled into a ref for the once-bound keydown handler
  const snakeEnabledRef = useRef(snakeEnabled);
  snakeEnabledRef.current = snakeEnabled;

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
    setLayout(genLayout());
    setPlayer({ x: 0, y: 0 });
    setVisited(new Set([START]));
    setCollected(new Set());
    setFullBonusPaid(false);
  };

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
          onEarnRef.current(SPECIAL_BONUS);
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
      const p = playerRef.current;
      const nx = p.x + d[0];
      const ny = p.y + d[1];
      // ignore moves off-grid or into a blocked building
      if (
        nx < 0 ||
        nx >= COLS ||
        ny < 0 ||
        ny >= ROWS ||
        blockedRef.current.has(idx(nx, ny))
      ) {
        return;
      }
      const cellIdx = idx(nx, ny);
      // armed once every package is collected; returning to the depot finishes
      // the route — pay the bonus, bump the count, and roll a fresh layout
      const armed =
        specialsRef.current.size > 0 &&
        collectedRef.current.size === specialsRef.current.size;
      if (armed && cellIdx === START) {
        setRoutes((r) => r + 1);
        onEarnRef.current(ROUTE_BONUS);
        newLayout();
        return;
      }
      setPlayer({ x: nx, y: ny });
      // movement-only income: pay once, the first time a cell is covered
      if (!visitedRef.current.has(cellIdx)) onEarnRef.current(CASH_PER_STOP);
      const nv = new Set(visitedRef.current).add(cellIdx);
      setVisited(nv);
      // optional one-time bonus for fully exploring the route (never ends the route)
      const total = COLS * ROWS - blockedRef.current.size;
      if (!fullBonusPaidRef.current && nv.size === total) {
        setFullBonusPaid(true);
        onEarnRef.current(FULL_COVERAGE_BONUS);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

    // micrographic monospace labels under the grid (two rows)
    // primary objective = PACKAGES remaining, secondary = MAP coverage %
    const packagesLeft = specials.size - collected.size;
    const mapPct = Math.round((visited.size / TOTAL) * 100);
    ctx.fillStyle = INK;
    ctx.font = "12px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "middle";
    const rowY1 = PAD + GRID_H + 13;
    const rowY2 = PAD + GRID_H + 31;
    ctx.textAlign = "left";
    ctx.fillText(`PACKAGES ${String(packagesLeft).padStart(2, "0")}`, PAD, rowY1);
    ctx.fillText(`CASH $${cash}`, PAD, rowY2);
    ctx.textAlign = "right";
    ctx.fillText(`MAP ${mapPct}%`, WIDTH - PAD, rowY1);
    ctx.fillText(`ROUTES ${pad3(routes)}`, WIDTH - PAD, rowY2);

    // armed: prompt the player to drive back to the depot to finish the route
    if (armed) {
      ctx.fillStyle = ACCENT;
      ctx.textAlign = "center";
      ctx.fillText("RETURN TO DEPOT", WIDTH / 2, PAD + GRID_H - 10);
    }
    ctx.textAlign = "left";
  }, [player.x, player.y, visited, blocked, specials, collected, flash, routes, cash, TOTAL]);

  return (
    <Stack direction="vertical" gap={4}>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
      <Text>{`PACKAGES ${String(specials.size - collected.size).padStart(2, "0")}`}</Text>
      <Text>{`MAP ${Math.round((visited.size / TOTAL) * 100)}%`}</Text>
      <Text>{`CASH $${cash}`}</Text>
      <Text>{`ROUTES ${pad3(routes)}`}</Text>
      <Button label="Reset" onClick={newLayout} />
    </Stack>
  );
}
