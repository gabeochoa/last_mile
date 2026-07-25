import { useEffect, useState } from "react";
import { Theme } from "@astryxdesign/core";
import { Grid } from "./Grid";
import { Ending } from "./Ending";
import { Upgrades, micrographic } from "./Upgrades";
import { BUCKETS, upgradeCost, perDelivery, extraPackages, expandLevel, unownedShare, depotCount, vanSpeed } from "./config";
import { sizeForExpansion } from "./gridLogic";
import { clearSave, load, save } from "./save";
import { initAudioOnFirstGesture, isMuted, playSfx, setMuted } from "./audio";

// ?dev starts flush so the shop + purchases can be exercised/screenshotted.
const DEV = new URLSearchParams(window.location.search).get("dev") !== null;
// ?end forces the ending overlay so it can be screenshotted/tested without grinding.
const END_PREVIEW = new URLSearchParams(window.location.search).get("end") !== null;

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
  const [cash, setCash] = useState(DEV ? 9999 : loaded?.cash ?? 0);
  const [upgrades, setUpgrades] = useState<Record<string, number>>(loaded?.upgrades ?? {});
  const [stats, setStats] = useState({ packagesLeft: 0, mapPct: 0, routes: loaded?.routes ?? 0 });
  // latch: the shop appears after the first route is finished, then stays.
  const [revealed, setRevealed] = useState(DEV);
  const [muted, setMutedState] = useState(isMuted);
  const [autopilotEnabled, setAutopilotEnabled] = useState(true);

  // Current map dims from expansion; Demand Engine's cap = cells on the map.
  const dims = sizeForExpansion(expandLevel(upgrades));
  const maxLevels: Record<string, number> = { demand: dims.cols * dims.rows };

  // Create/resume the AudioContext on the first user gesture (autoplay policy).
  useEffect(() => initAudioOnFirstGesture(), []);

  useEffect(() => {
    if (!revealed && stats.routes >= 1) {
      setRevealed(true);
    }
  }, [stats.routes, revealed]);

  // Autosave meta whenever it changes (dev never writes the save).
  useEffect(() => {
    if (DEV) return;
    save({ version: 1, cash, upgrades, routes: stats.routes });
  }, [cash, upgrades, stats.routes]);

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

  // market takeover: unowned share counts down as you EXPAND the map.
  const theirShare = unownedShare(upgrades);

  // Latch the ending: once you own 100% (or ?end preview), it stays for the session.
  const [ended, setEnded] = useState(END_PREVIEW);
  useEffect(() => {
    if (theirShare <= 0) setEnded(true);
  }, [theirShare]);

  const onRestart = () => {
    clearSave();
    window.location.reload();
  };
  const displayShare = useAnimatedNumber(theirShare);
  const displayPackages = useAnimatedNumber(stats.packagesLeft);

  return (
    <Theme theme={micrographic} mode="dark">
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
        <span>CASH ${cash}</span>

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
              border: "1px solid rgba(232,84,30,0.5)",
              color: "#E8541E",
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
        <Upgrades cash={cash} upgrades={upgrades} onBuy={onBuy} maxLevels={maxLevels} />
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
        {/* Hero countdown: unowned market share — hits 0 when you win. */}
        <div style={{ textAlign: "center", color: "#E8541E" }}>
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

        <Grid
          onEarn={(delta) => setCash((c) => c + delta)}
          onStats={setStats}
          autoDeliver={(upgrades.autoDeliver ?? 0) > 0}
          autopilot={(upgrades.autopilot ?? 0) > 0 && autopilotEnabled}
          fleet={upgrades.fleet ?? 0}
          vanSpeed={vanSpeed(upgrades)}
          autoStartDay={(upgrades.autoStart ?? 0) > 0}
          perDelivery={perDelivery(upgrades)}
          extraPackages={extraPackages(upgrades)}
          depotCount={depotCount(upgrades)}
          {...dims}
          initialRoutes={loaded?.routes ?? 0}
        />
      </div>

      {ended && <Ending routes={stats.routes} cash={cash} onRestart={onRestart} />}
    </Theme>
  );
}
