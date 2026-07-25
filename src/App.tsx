import { useEffect, useState } from "react";
import { Theme } from "@astryxdesign/core";
import { Grid } from "./Grid";
import { Upgrades, micrographic } from "./Upgrades";
import { BUCKETS, upgradeCost, cashMult, SHARE_PER_ROUTE } from "./config";

// ?dev starts flush so the shop + purchases can be exercised/screenshotted.
const DEV = new URLSearchParams(window.location.search).get("dev") !== null;

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
  const [cash, setCash] = useState(DEV ? 9999 : 0);
  const [upgrades, setUpgrades] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({ packagesLeft: 0, mapPct: 0, routes: 0 });
  // latch: once the first upgrade is affordable/owned the shop stays revealed.
  const [revealed, setRevealed] = useState(DEV);

  useEffect(() => {
    if (!revealed && cash >= 10) {
      setRevealed(true);
    }
  }, [cash, revealed]);

  const onBuy = (id: string) => {
    const u = BUCKETS.flatMap((b) => b.items).find((it) => it.id === id);
    if (!u) return;
    const level = upgrades[id] ?? 0;
    if (level >= (u.maxLevel ?? 1)) return;
    const cost = upgradeCost(u, level);
    if (cash < cost) return;
    setCash((c) => c - cost);
    setUpgrades((prev) => ({ ...prev, [id]: level + 1 }));
  };

  // market takeover: their unowned share counts down as you clear routes.
  const theirShare = 100 - Math.min(100, stats.routes * SHARE_PER_ROUTE);
  const routesToMonopoly = Math.max(0, Math.ceil(theirShare / SHARE_PER_ROUTE));
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
        <span>CASH ${cash}</span>
        <span style={{ color: "#E8541E" }}>
          ROUTES TO MONOPOLY {String(routesToMonopoly).padStart(2, "0")} ▼
        </span>
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
        <Upgrades cash={cash} upgrades={upgrades} onBuy={onBuy} />
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
          cashMult={cashMult(upgrades)}
        />
      </div>
    </Theme>
  );
}
