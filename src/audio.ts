// WebAudio SFX: short synthesized blips, no asset files. All quiet + brief.
// Context is created lazily on first user gesture (autoplay policy).

const MUTE_KEY = "lastmile.muted";
const VOL_KEY = "lastmile.volume";

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

// Master volume 0..1, persisted. Older saves used a mute flag — honor it as volume 0 on
// first read so a previously-muted player stays muted. Defaults to full (1) otherwise.
export function getVolume(): number {
  if (typeof localStorage === "undefined") return 1;
  const raw = localStorage.getItem(VOL_KEY);
  if (raw !== null) {
    const v = parseFloat(raw);
    return isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  }
  return localStorage.getItem(MUTE_KEY) === "1" ? 0 : 1;
}

export function setVolume(v: number): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(VOL_KEY, String(Math.min(1, Math.max(0, v))));
}

// Per-sound enable flags (default on) so players can silence individual chirps.
export type SfxName = "deliver" | "purchase" | "route";
const SFX_KEY = "lastmile.sfx.";
export function sfxEnabled(name: SfxName): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(SFX_KEY + name) !== "0";
}
export function setSfxEnabled(name: SfxName, on: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SFX_KEY + name, on ? "1" : "0");
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

export function playSfx(name: SfxName): void {
  const vol = getVolume();
  if (vol <= 0 || !sfxEnabled(name)) return;
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  // scale every note's peak by the master volume
  const b = (freq: number, start: number, dur: number, peak: number) => blip(c, freq, start, dur, peak * vol);
  if (name === "deliver") {
    b(880, t, 0.09, 0.08);
  } else if (name === "purchase") {
    b(440, t, 0.08, 0.09);
    b(660, t + 0.06, 0.1, 0.09);
  } else {
    // route: brief rising 3-note arpeggio, celebratory but subtle.
    b(523, t, 0.1, 0.07);
    b(659, t + 0.06, 0.1, 0.07);
    b(784, t + 0.12, 0.14, 0.08);
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
