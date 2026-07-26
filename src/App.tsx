import { useEffect, useMemo, useRef, useState } from "react";
import { Theme } from "@astryxdesign/core";
import { Grid } from "./Grid";
import { Ending } from "./Ending";
import { Intro } from "./Intro";
import { Upgrades, makeMicrographic } from "./Upgrades";
import { BUCKETS, upgradeCost, perDelivery, routeBonus, extraPackages, expandLevel, unownedShare, depotCount, vanSpeed, daySpeed, DEFAULT_ACCENT, BASE_PACKAGES, fmtNum, rivalColors, rivalCompanyCount } from "./config";
import { sizeForExpansion } from "./gridLogic";
import { clearSave, load, save } from "./save";
import { initAudioOnFirstGesture, isMuted, playSfx, setMuted } from "./audio";

// ?dev starts flush so the shop + purchases can be exercised/screenshotted.
const DEV = new URLSearchParams(window.location.search).get("dev") !== null;
// ?end forces the ending overlay so it can be screenshotted/tested without grinding.
const END_PREVIEW = new URLSearchParams(window.location.search).get("end") !== null;
// ?intro forces the intro/title overlay so it can be screenshotted/tested.
const INTRO_PREVIEW = new URLSearchParams(window.location.search).get("intro") !== null;

// Eases a displayed value toward target via rAF so countdowns visibly tick. Rounds to
// an integer unless a decimal count is given (the market share reads like 99.99%).
function useAnimatedNumber(target: number, ms = 500, decimals = 0): number {
  const [value, setValue] = useState(target);
  useEffect(() => {
    const start = value;
    if (start === target) return;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - t0) / ms);
      setValue(start + (target - start) * t);
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
    // value read as the animation's start point only when target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function App() {
  // Resume meta from the last session (skipped in ?dev, which starts flush).
  const [loaded] = useState(() => (DEV ? null : load()));
  // A resumed save counts as "in progress" if any day was run OR any upgrade owned —
  // used to skip the intro and keep the shop revealed so a refresh doesn't look fresh.
  const hasProgress =
    !!loaded && ((loaded.routes ?? 0) > 0 || Object.keys(loaded.upgrades ?? {}).length > 0);
  // Show the title screen on a fresh start; skip in ?dev and when resuming progress.
  const [intro, setIntro] = useState(() => INTRO_PREVIEW || (!DEV && !hasProgress));
  const [cash, setCash] = useState(DEV ? 9999 : loaded?.cash ?? 0);
  const [upgrades, setUpgrades] = useState<Record<string, number>>(loaded?.upgrades ?? {});
  const [stats, setStats] = useState({ packagesLeft: 0, mapPct: 0, routes: loaded?.routes ?? 0, capacity: 0, reserved: 0, total: 0, dayEnded: false });
  // latch: the shop appears once you can afford two upgrades, then stays — and is
  // already shown when resuming a save with progress (so a refresh keeps the shop).
  const [revealed, setRevealed] = useState(DEV || hasProgress);
  const [muted, setMutedState] = useState(isMuted);
  const [autopilotEnabled, setAutopilotEnabled] = useState(true);
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);
  // player's chosen brand color; recolors the whole UI + canvas from one value.
  const [accent, setAccent] = useState(loaded?.accent ?? DEFAULT_ACCENT);
  const theme = useMemo(() => makeMicrographic(accent), [accent]);

  // Current map dims from expansion. Demand Engine's cap = the empty delivery slots
  // in the current grid (open, non-depot, minus rival-held cells), so you can't add
  // more deliveries than there's room for. Grid reports this as stats.capacity.
  const dims = sizeForExpansion(expandLevel(upgrades));
  const maxLevels: Record<string, number> = { demand: Math.max(0, stats.capacity - BASE_PACKAGES) };
  // The game is "won" when every purchasable upgrade is maxed (nothing left to buy).
  const allMaxed = BUCKETS.flatMap((b) => b.items).every((it) => {
    if (!it.id || it.softCap) return true; // soft caps (Demand) fluctuate — don't gate the ending
    const max = maxLevels[it.id] ?? it.maxLevel ?? 1;
    return (upgrades[it.id] ?? 0) >= max;
  });
  // Once the map is large, the center HUD reflows to give the grid room.
  const bigMap = Math.max(dims.cols, dims.rows) >= 9;

  // Create/resume the AudioContext on the first user gesture (autoplay policy).
  useEffect(() => initAudioOnFirstGesture(), []);

  // Reveal the shop once you can afford the two cheapest upgrades — enough to make a
  // real first choice, not a single forced buy. Latches on.
  const nextCosts = BUCKETS.flatMap((b) => b.items)
    .map((it) => {
      if (!it.id) return Infinity;
      const lvl = upgrades[it.id] ?? 0;
      const max = maxLevels[it.id] ?? it.maxLevel ?? 1;
      return lvl >= max ? Infinity : upgradeCost(it, lvl);
    })
    .sort((a, b) => a - b);
  const canAffordTwo = cash >= (nextCosts[0] ?? Infinity) + (nextCosts[1] ?? Infinity);
  useEffect(() => {
    if (!revealed && canAffordTwo) {
      setRevealed(true);
    }
  }, [canAffordTwo, revealed]);

  // Autosave meta whenever it changes (dev never writes the save).
  useEffect(() => {
    if (DEV) return;
    save({ version: 1, cash, upgrades, routes: stats.routes, accent });
  }, [cash, upgrades, stats.routes, accent]);

  const onBuy = (id: string) => {
    const u = BUCKETS.flatMap((b) => b.items).find((it) => it.id === id);
    if (!u) return;
    const level = upgrades[id] ?? 0;
    if (level >= (maxLevels[id] ?? u.maxLevel ?? 1)) return;
    const cost = upgradeCost(u, level);
    if (cash < cost) return;
    setCash((c) => c - cost);
    setUpgrades((prev) => ({ ...prev, [id]: level + 1 }));
    playSfx("purchase");
  };

  // Cash EARNED per day: track a running earnings total (income only — upgrade
  // purchases never subtract from it) and snapshot the gain between day completions.
  const [dayRate, setDayRate] = useState(0);
  const earnedRef = useRef(0);
  const lastDayEarnedRef = useRef(0);
  const prevRoutesRef = useRef(stats.routes);
  useEffect(() => {
    if (stats.routes > prevRoutesRef.current) {
      setDayRate(earnedRef.current - lastDayEarnedRef.current);
      lastDayEarnedRef.current = earnedRef.current;
      prevRoutesRef.current = stats.routes;
    }
  }, [stats.routes]);

  // Rivals hold ~90% of new frontier; each Buy Out Rivals level frees 15% of it.
  const rivalFraction = Math.max(0, 0.9 - 0.15 * (upgrades.buyout ?? 0));
  // A new rival company (distinct color, never yours) appears every 10 expansions.
  const companyColors = rivalColors(accent, rivalCompanyCount(expandLevel(upgrades)));
  // Planet-wide unowned market share (starts 100%, → 0 when you own every spot).
  const theirShare = unownedShare(upgrades);

  // Show the ending once every upgrade is maxed (or ?end preview). Continue dismisses
  // it and sets keepPlaying so it won't pop again this session.
  const [keepPlaying, setKeepPlaying] = useState(false);
  const [ended, setEnded] = useState(END_PREVIEW);
  useEffect(() => {
    if (allMaxed && !keepPlaying) setEnded(true);
  }, [allMaxed, keepPlaying]);

  const onRestart = () => {
    clearSave();
    window.location.reload();
  };
  const displayShare = useAnimatedNumber(theirShare, 500, 2);
  const displayPackages = useAnimatedNumber(stats.packagesLeft);
  const displayCash = useAnimatedNumber(cash, 400);

  // Controls hint fades in under the map at the start, then fades out for good once
  // the shop is revealed (by then you know how to play). Its slot keeps a fixed
  // height so showing/hiding it never nudges the map box.
  const [instrShown, setInstrShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setInstrShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  return (
    <Theme theme={theme} mode="dark">
      {/* Top banner: map coverage + cash + routes, pinned across the top. */}
      <div
        style={{
          position: "fixed",
          insetBlockStart: 0,
          insetInlineStart: 0,
          insetInlineEnd: 0,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          paddingInline: 12,
          background: "#0F0F0F",
          borderBlockEnd: "1px solid rgba(236,231,218,0.15)",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 13,
          letterSpacing: 1,
          color: "#ECE7DA",
          zIndex: 2,
        }}
      >
        {/* Stats grouped left so they never collide with the right-hand controls. */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, minWidth: 0 }}>
          <span>DAY {stats.routes + 1}</span>
          {bigMap && <span>DELIVERIES {String(displayPackages).padStart(2, "0")}</span>}
          <span>
            CASH ${fmtNum(displayCash)}
            <span style={{ opacity: 0.6, marginInlineStart: 8 }}>
              {dayRate >= 0 ? "+" : "−"}${fmtNum(Math.abs(dayRate))}/day
            </span>
          </span>
        </div>

        {/* Controls grouped right: autopilot toggle · drivers · SFX · reset */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {(upgrades.autopilot ?? 0) > 0 && (
            <button
              onClick={() => setAutopilotEnabled((v) => !v)}
              title={autopilotEnabled ? "Autopilot on — click for manual" : "Autopilot off — click to resume"}
              style={{
                background: "transparent",
                border: "1px solid rgba(236,231,218,0.25)",
                color: autopilotEnabled ? "#ECE7DA" : "rgba(236,231,218,0.4)",
                fontFamily: "inherit",
                fontSize: 12,
                letterSpacing: 1,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              {autopilotEnabled ? "AUTOPILOT ON" : "AUTOPILOT OFF"}
            </button>
          )}
          {(upgrades.autoStart ?? 0) > 0 && (
            <button
              onClick={() => setAutoStartEnabled((v) => !v)}
              title={autoStartEnabled ? "Days start on their own — click for manual Start Day" : "Manual Start Day — click to auto-start"}
              style={{
                background: "transparent",
                border: "1px solid rgba(236,231,218,0.25)",
                color: autoStartEnabled ? "#ECE7DA" : "rgba(236,231,218,0.4)",
                fontFamily: "inherit",
                fontSize: 12,
                letterSpacing: 1,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              {autoStartEnabled ? "AUTO-START ON" : "AUTO-START OFF"}
            </button>
          )}
          {(upgrades.fleet ?? 0) > 0 && (
            <span style={{ fontSize: 12, letterSpacing: 1 }}>DRIVERS {upgrades.fleet}</span>
          )}
          <button
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
            }}
            title={muted ? "Sound off" : "Sound on"}
            style={{
              background: "transparent",
              border: "1px solid rgba(236,231,218,0.25)",
              color: muted ? "rgba(236,231,218,0.4)" : "#ECE7DA",
              fontFamily: "inherit",
              fontSize: 12,
              letterSpacing: 1,
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            {muted ? "SFX OFF" : "SFX ON"}
          </button>
          {/* temporary: full reset (wipe save + reload) for testing */}
          <button
            onClick={onRestart}
            title="Full reset — wipe save and start from the beginning"
            style={{
              background: "transparent",
              border: `1px solid ${accent}`,
              color: accent,
              fontFamily: "inherit",
              fontSize: 12,
              letterSpacing: 1,
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            RESET
          </button>
        </div>
      </div>

      {/* Sidebar: fixed on the left, slides + fades in on first reveal. */}
      <div
        style={{
          position: "fixed",
          insetBlockStart: 0,
          insetInlineStart: 0,
          opacity: revealed ? 1 : 0,
          transform: revealed ? "none" : "translateX(-100%)",
          transition: "opacity 400ms ease, transform 400ms ease",
          pointerEvents: revealed ? "auto" : "none",
          zIndex: 1,
        }}
      >
        <Upgrades
          cash={cash}
          upgrades={upgrades}
          onBuy={onBuy}
          maxLevels={maxLevels}
          footer={
            bigMap ? (
              <span style={{ color: accent, fontWeight: 700, fontSize: 22, letterSpacing: 2 }}>
                {displayShare.toFixed(2)}% UNOWNED
              </span>
            ) : undefined
          }
        />
      </div>

      {/* Map: centered; slides right (padding grows) once the sidebar reveals. */}
      <div
        style={{
          minHeight: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 14,
          paddingInlineStart: revealed ? 320 : 0,
          paddingBlockStart: 56,
          transition: "padding 400ms ease",
          fontFamily: "ui-monospace, Menlo, monospace",
          color: "#ECE7DA",
        }}
      >
        {/* Small map: big centered hero + deliveries + instructions above the grid.
            Big map: these reflow into the banner / sidebar, leaving just the grid. */}
        {!bigMap && (
          <>
            {/* Hero countdown: unowned market share — hits 0 when you win. */}
            <div style={{ textAlign: "center", color: accent }}>
              <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: 2, lineHeight: 0.9 }}>
                {displayShare.toFixed(2)}%
              </div>
              <div style={{ fontSize: 16, opacity: 0.85, letterSpacing: 3 }}>
                UNOWNED MARKET ▼
              </div>
            </div>

            {/* Deliveries remaining (secondary) + controls, above the map. */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2, lineHeight: 1 }}>
                {String(displayPackages).padStart(2, "0")}
                <span style={{ fontSize: 12, opacity: 0.7, marginInlineStart: 8, letterSpacing: 1 }}>
                  DELIVERIES LEFT
                </span>
              </div>
            </div>
          </>
        )}

        <Grid
          onEarn={(delta) => {
            earnedRef.current += delta;
            setCash((c) => c + delta);
          }}
          onStats={setStats}
          autoDeliver={(upgrades.autoDeliver ?? 0) > 0}
          autopilot={(upgrades.autopilot ?? 0) > 0 && autopilotEnabled}
          fleet={upgrades.fleet ?? 0}
          vanSpeed={vanSpeed(upgrades)}
          daySpeed={daySpeed(upgrades)}
          autoStartDay={(upgrades.autoStart ?? 0) > 0 && autoStartEnabled}
          rivalFraction={rivalFraction}
          rivalColors={companyColors}
          accent={accent}
          perDelivery={perDelivery(upgrades)}
          routeBonus={routeBonus(upgrades)}
          extraPackages={extraPackages(upgrades)}
          depotCount={depotCount(upgrades)}
          {...dims}
          initialRoutes={loaded?.routes ?? 0}
        />

        {/* Controls hint below the box — fixed-height slot so it never moves the box;
            fades in at the start, fades out once the shop is revealed. */}
        <div style={{ height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: 1,
              opacity: instrShown && !revealed ? 0.55 : 0,
              transition: "opacity 600ms ease",
            }}
          >
            ARROWS DRIVE · SPACE DELIVER · RETURN TO DEPOT
          </div>
        </div>
      </div>

      {intro && <Intro accent={accent} onPickAccent={setAccent} onStart={() => setIntro(false)} />}
      {ended && (
        <Ending
          routes={stats.routes}
          cash={cash}
          accent={accent}
          onRestart={onRestart}
          onContinue={() => {
            setEnded(false);
            setKeepPlaying(true);
          }}
        />
      )}
    </Theme>
  );
}
