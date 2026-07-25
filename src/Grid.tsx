import { useEffect, useRef, useState } from "react";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";

const COLS = 8;
const ROWS = 8;
const CELL = 48;
const PAD = 16;

const BG = "#0F0F0F";
const INK = "#ECE7DA";
const ACCENT = "#E8541E";

const FOOTER = 30;
const TOTAL = COLS * ROWS;
const GRID_H = ROWS * CELL;
const WIDTH = COLS * CELL + PAD * 2;
const HEIGHT = GRID_H + PAD * 2 + FOOTER;

const idx = (x: number, y: number) => y * COLS + x;
const pad3 = (n: number) => String(n).padStart(3, "0");

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
  const [visited, setVisited] = useState<Set<number>>(() => new Set([idx(0, 0)]));
  const [routes, setRoutes] = useState(0);

  const reset = () => {
    setPlayer({ x: 0, y: 0 });
    setVisited(new Set([idx(0, 0)]));
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
      setPlayer((p) => {
        const next = {
          x: Math.max(0, Math.min(COLS - 1, p.x + d[0])),
          y: Math.max(0, Math.min(ROWS - 1, p.y + d[1])),
        };
        setVisited((v) => {
          const nv = new Set(v).add(idx(next.x, next.y));
          if (nv.size === TOTAL) {
            // route complete: bump counter, clear for a fresh run
            setRoutes((r) => r + 1);
            return new Set([idx(next.x, next.y)]);
          }
          return nv;
        });
        return next;
      });
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
      `COVERAGE ${pad3(visited.size).slice(1)}/${TOTAL}`,
      PAD,
      labelY,
    );
    const routesLabel = `ROUTES ${pad3(routes)}`;
    ctx.textAlign = "right";
    ctx.fillText(routesLabel, WIDTH - PAD, labelY);
    ctx.textAlign = "left";
  }, [player.x, player.y, visited, routes]);

  return (
    <Stack direction="vertical" gap={4}>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
      <Text>{`COVERAGE ${visited.size}/${TOTAL}`}</Text>
      <Text>{`ROUTES ${pad3(routes)}`}</Text>
      <Button label="Reset" onClick={reset} />
    </Stack>
  );
}
