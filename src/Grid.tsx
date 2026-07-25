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

const FOOTER = 30;
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

// fresh random layout: 6-9 blocked cells (never START), guaranteed fully reachable
function genLayout(): Set<number> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const blocked = new Set<number>();
    const count = 6 + Math.floor(Math.random() * 4); // 6-9
    while (blocked.size < count) {
      const c = Math.floor(Math.random() * COLS * ROWS);
      if (c !== START) blocked.add(c);
    }
    if (allReachable(blocked)) return blocked;
  }
  return new Set(); // fallback: no blocked cells is trivially reachable
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

export function Grid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [player, setPlayer] = useState({ x: 0, y: 0 });
  const [blocked, setBlocked] = useState<Set<number>>(() => genLayout());
  const [visited, setVisited] = useState<Set<number>>(() => new Set([START]));
  const [routes, setRoutes] = useState(0);
  const [cash, setCash] = useState(0);

  const TOTAL = COLS * ROWS - blocked.size;

  // refs so the keydown handler always sees current state without re-binding
  const playerRef = useRef(player);
  playerRef.current = player;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const visitedRef = useRef(visited);
  visitedRef.current = visited;

  const newLayout = () => {
    setBlocked(genLayout());
    setPlayer({ x: 0, y: 0 });
    setVisited(new Set([START]));
  };

  useEffect(() => {
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const onKey = (e: KeyboardEvent) => {
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
      setPlayer({ x: nx, y: ny });
      // movement-only income: pay once, the first time a cell is covered
      if (!visitedRef.current.has(cellIdx)) setCash((c) => c + CASH_PER_STOP);
      const nv = new Set(visitedRef.current).add(cellIdx);
      const total = COLS * ROWS - blockedRef.current.size;
      if (nv.size === total) {
        // route complete: bump counter, pay the bonus, roll a fresh layout
        setRoutes((r) => r + 1);
        setCash((c) => c + ROUTE_BONUS);
        newLayout();
      } else {
        setVisited(nv);
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

    // player = solid accent square, slightly inset
    const inset = 6;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(
      PAD + player.x * CELL + inset,
      PAD + player.y * CELL + inset,
      CELL - inset * 2,
      CELL - inset * 2,
    );

    // micrographic monospace label under the grid
    ctx.fillStyle = INK;
    ctx.font = "12px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "middle";
    const labelY = PAD + GRID_H + FOOTER / 2 + 2;
    ctx.fillText(
      `REMAINING ${String(TOTAL - visited.size).padStart(2, "0")}/${TOTAL}`,
      PAD,
      labelY,
    );
    ctx.textAlign = "center";
    ctx.fillText(`CASH $${cash}`, WIDTH / 2, labelY);
    const routesLabel = `ROUTES ${pad3(routes)}`;
    ctx.textAlign = "right";
    ctx.fillText(routesLabel, WIDTH - PAD, labelY);
    ctx.textAlign = "left";
  }, [player.x, player.y, visited, blocked, routes, cash, TOTAL]);

  return (
    <Stack direction="vertical" gap={4}>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
      <Text>{`REMAINING ${TOTAL - visited.size}/${TOTAL}`}</Text>
      <Text>{`CASH $${cash}`}</Text>
      <Text>{`ROUTES ${pad3(routes)}`}</Text>
      <Button label="Reset" onClick={newLayout} />
    </Stack>
  );
}
