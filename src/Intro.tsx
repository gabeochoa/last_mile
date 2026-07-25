import { useEffect, useState } from "react";

// Title / intro screen shown on a fresh start, before the first delivery.
// Full-screen fixed overlay above the HUD; fades in over ~1.2s (mirrors Ending).
export function Intro({ onStart }: { onStart: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
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
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: 4, lineHeight: 0.9 }}>
          LAST MILE
        </div>
      </div>

      <div style={{ maxWidth: 520, fontSize: 15, lineHeight: 1.6, opacity: 0.85, letterSpacing: 0.5 }}>
        <p style={{ margin: 0 }}>You've just started out as an independent delivery driver.</p>
        <p style={{ margin: "10px 0 0" }}>
          Deliver the packages, expand your routes, and take over the world's market share.
        </p>
      </div>

      <button
        onClick={onStart}
        style={{
          marginBlockStart: 8,
          background: "transparent",
          color: "#ECE7DA",
          border: "1px solid rgba(236,231,218,0.4)",
          padding: "10px 22px",
          fontFamily: "inherit",
          fontSize: 12,
          letterSpacing: 2,
          cursor: "pointer",
        }}
      >
        START DELIVERING
      </button>
    </div>
  );
}
