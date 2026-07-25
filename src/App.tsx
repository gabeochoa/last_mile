import { useEffect, useMemo, useRef, useState } from "react";
import { Theme } from "@astryxdesign/core";
import { Grid } from "./Grid";
import { Ending } from "./Ending";
import { Intro } from "./Intro";
import { Upgrades, makeMicrographic } from "./Upgrades";
import { BUCKETS, upgradeCost, perDelivery, routeBonus, extraPackages, expandLevel, unownedShare, depotCount, vanSpeed, daySpeed, DEFAULT_ACCENT, BASE_PACKAGES } from "./config";
import { sizeForExpansion } from "./gridLogic";
import { clearSave, load, save } from "./save";
import { initAudioOnFirstGesture, isMuted, playSfx, setMuted } from "./audio";

// ?dev starts flush so the shop + purchases can be exercised/screenshotted.
const DEV = new URLSearchParams(window.location.search).get("dev") !== null;
// ?end forces the ending overlay so it can be screenshotted/tested without grinding.
const END_PREVIEW = new URLSearchParams(window.location.search).get("end") !== null;
// ?intro forces the intro/title overlay so it can be screenshotted/tested.
const INTRO_PREVIEW = new URLSearchParams(window.location.search).get("intro") !== null;

// Eases a displayed value toward target via rAF so countdowns visibly tick.
function useAnimatedNumber(target: number, ms = 500): number {
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
  return Math.round(value);
}

export function App() {
  // Resume meta from the last session (skipped in ?dev, which starts flush).
  const [loaded] = useState(() => (DEV ? null : load()));
  // Show the title screen on a fresh start; skip in ?dev and when resuming
  // a save with progress; force it with ?intro.
  const [intro, setIntro] = useState(
    () => INTRO_PREVIEW || (!DEV && !(loaded && (loaded.routes ?? 0) > 0))
  );
  const [cash, setCash] = useState(DEV ? 9999 : loaded?.cash ?? 0);
  const [upgrades, setUpgrades] = useState<Record<string, number>>(loaded?.upgrades ?? {});
  const [stats, setStats] = useState({ packagesLeft: 0, mapPct: 0, routes: loaded?.routes ?? 0, capacity: 0 });
  // latch: the shop appears after the first route is finished, then stays.
  const [revealed, setRevealed] = useState(DEV);
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
    if (!it.id) return true;
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

  // Cash rate ($/s): sample the cash delta once a second. Shown in the banner once
  // Autopilot is owned (that's when income runs hands-off and a rate is meaningful).
  const [rate, setRate] = useState(0);
  const cashRef = useRef(cash);
  cashRef.current = cash;
  const lastCashRef = useRef(cash);
  useEffect(() => {
    const id = window.setInterval(() => {
      setRate(cashRef.current - lastCashRef.current);
      lastCashRef.current = cashRef.current;
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  const showRate = (upgrades.autopilot ?? 0) > 0;

  // market takeover: unowned share counts down as you EXPAND the map.
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
  const displayShare = useAnimatedNumber(theirShare);
  const displayPackages = useAnimatedNumber(stats.packagesLeft);

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
          justifyContent: "center",
          gap: 28,
          background: "#0F0F0F",
          borderBlockEnd: "1px solid rgba(236,231,218,0.15)",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 13,
          letterSpacing: 1,
          color: "#ECE7DA",
          zIndex: 2,
        }}
      >
        <span>DAY {stats.routes + 1}</span>
        <span>
          CASH ${cash}
          {showRate && (
            <span style={{ opacity: 0.6, marginInlineStart: 8 }}>
              {rate >= 0 ? "+" : "−"}${Math.abs(rate)}/s
            </span>
          )}
        </span>
        {bigMap && <span>DELIVERIES {String(displayPackages).padStart(2, "0")}</span>}

        {/* Controls grouped right: autopilot toggle · drivers · SFX · reset */}
        <div
          style={{
            position: "absolute",
            insetInlineEnd: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
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
                {displayShare}% UNOWNED
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
                {displayShare}%
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
              <div style={{ fontSize: 12, opacity: 0.55, marginBlockStart: 6, letterSpacing: 1 }}>
                ARROWS DRIVE · SPACE DELIVER · RETURN TO DEPOT
              </div>
            </div>
          </>
        )}

        <Grid
          onEarn={(delta) => setCash((c) => c + delta)}
          onStats={setStats}
          autoDeliver={(upgrades.autoDeliver ?? 0) > 0}
          autopilot={(upgrades.autopilot ?? 0) > 0 && autopilotEnabled}
          fleet={upgrades.fleet ?? 0}
          vanSpeed={vanSpeed(upgrades)}
          daySpeed={daySpeed(upgrades)}
          autoStartDay={(upgrades.autoStart ?? 0) > 0 && autoStartEnabled}
          rivals={theirShare > 0 ? Math.max(1, Math.round((theirShare / 100) * 6)) : 0}
          accent={accent}
          perDelivery={perDelivery(upgrades)}
          routeBonus={routeBonus(upgrades)}
          extraPackages={extraPackages(upgrades)}
          depotCount={depotCount(upgrades)}
          {...dims}
          initialRoutes={loaded?.routes ?? 0}
        />
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
