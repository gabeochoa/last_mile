// WebAudio SFX: short synthesized blips, no asset files. All quiet + brief.
// Context is created lazily on first user gesture (autoplay policy).

const MUTE_KEY = "lastmile.muted";

let ctx: AudioContext | null = null;

// Guarded so tests/SSR (no window/AudioContext) never touch it.
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function isMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(b: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MUTE_KEY, b ? "1" : "0");
}

// One osc + gain envelope: quick attack, exponential decay.
function blip(c: AudioContext, freq: number, start: number, dur: number, peak: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function playSfx(name: "deliver" | "purchase" | "route"): void {
  if (isMuted()) return;
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  if (name === "deliver") {
    blip(c, 880, t, 0.09, 0.08);
  } else if (name === "purchase") {
    blip(c, 440, t, 0.08, 0.09);
    blip(c, 660, t + 0.06, 0.1, 0.09);
  } else {
    // route: brief rising 3-note arpeggio, celebratory but subtle.
    blip(c, 523, t, 0.1, 0.07);
    blip(c, 659, t + 0.06, 0.1, 0.07);
    blip(c, 784, t + 0.12, 0.14, 0.08);
  }
}

// Create/resume the context on the first gesture, then unbind itself.
export function initAudioOnFirstGesture(): void {
  if (typeof window === "undefined") return;
  const init = () => {
    getCtx();
    window.removeEventListener("pointerdown", init);
    window.removeEventListener("keydown", init);
  };
  window.addEventListener("pointerdown", init);
  window.addEventListener("keydown", init);
}
