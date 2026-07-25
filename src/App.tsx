import { useEffect, useState } from "react";
import { Theme } from "@astryxdesign/core";
import { Grid } from "./Grid";
import { Upgrades, micrographic } from "./Upgrades";

const COSTS: Record<string, number> = { momentumDrive: 10 };

// ?dev starts flush so the shop + purchases can be exercised/screenshotted.
const DEV = new URLSearchParams(window.location.search).get("dev") !== null;

export function App() {
  const [cash, setCash] = useState(DEV ? 9999 : 0);
  const [upgrades, setUpgrades] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({ packagesLeft: 0, mapPct: 0, routes: 0 });
  // latch: once the first upgrade is affordable/owned the shop stays revealed.
  const [revealed, setRevealed] = useState(DEV);

  useEffect(() => {
    if (!revealed && (cash >= 10 || (upgrades.momentumDrive ?? 0) > 0)) {
      setRevealed(true);
    }
  }, [cash, upgrades, revealed]);

  const onBuy = (id: string) => {
    const cost = COSTS[id];
    if (cost == null || cash < cost || (upgrades[id] ?? 0) > 0) return;
    setCash((c) => c - cost);
    setUpgrades((u) => ({ ...u, [id]: 1 }));
  };

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
        <span>MAP {stats.mapPct}%</span>
        <span style={{ color: "#E8541E" }}>CASH ${cash}</span>
        <span>ROUTES {String(stats.routes).padStart(3, "0")}</span>
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
          justifyContent: "center",
          alignItems: "center",
          paddingInlineStart: revealed ? 320 : 0,
          paddingBlockStart: 56,
          transition: "padding 400ms ease",
        }}
      >
        <Grid
          cash={cash}
          onEarn={(delta) => setCash((c) => c + delta)}
          onStats={setStats}
        />
      </div>
    </Theme>
  );
}
