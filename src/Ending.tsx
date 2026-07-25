import { useEffect, useState } from "react";

// End card shown when the player owns 100% of the market (UNOWNED hits 0).
// Full-screen fixed overlay above the HUD; fades in over ~1.2s.
export function Ending({
  routes: _routes,
  cash: _cash,
  onRestart,
}: {
  routes: number;
  cash: number;
  onRestart: () => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      onClick={onRestart}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 28,
        background: "#0F0F0F",
        color: "#ECE7DA",
        fontFamily: "ui-monospace, Menlo, monospace",
        textAlign: "center",
        padding: 24,
        opacity: shown ? 1 : 0,
        transition: "opacity 1200ms ease",
      }}
    >
      <div style={{ color: "#E8541E" }}>
        <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: 2, lineHeight: 0.9 }}>0%</div>
        <div style={{ fontSize: 16, opacity: 0.85, letterSpacing: 3 }}>UNOWNED MARKET</div>
      </div>
    </div>
  );
}
