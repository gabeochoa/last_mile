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
          transition: "padding 400ms ease",
        }}
      >
        <Grid cash={cash} onEarn={(delta) => setCash((c) => c + delta)} />
      </div>
    </Theme>
  );
}
