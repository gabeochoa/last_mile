// Code-drawn map render. Minimal stub for now.
import type { GameState } from "./state";

let ctx: CanvasRenderingContext2D | null = null;

export function setupCanvas(container: HTMLElement): void {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  container.appendChild(canvas);
  ctx = canvas.getContext("2d");
}

export function drawFrame(_state: GameState): void {
  if (!ctx) return;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // TODO(phase5): draw WFC-generated road map, houses, and van icons as shapes.
}
