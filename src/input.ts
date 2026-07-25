// Keyboard input. Lightly real: arrow keys + Space.
export type Input = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  deliver: boolean;
};

const state: Input = {
  up: false,
  down: false,
  left: false,
  right: false,
  deliver: false,
};

const KEY_MAP: Record<string, keyof Input> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  " ": "deliver",
};

export function setupInput(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("keydown", (e) => set(e.key, true));
  window.addEventListener("keyup", (e) => set(e.key, false));
}

function set(key: string, down: boolean): void {
  const action = KEY_MAP[key];
  if (action) state[action] = down;
}

export function getInput(): Input {
  return { ...state };
}
