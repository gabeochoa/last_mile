import { useEffect, useState } from "react";

// End card shown when the player has maxed every upgrade (nothing left to buy).
// Full-screen fixed overlay above the HUD; fades in over ~1.2s. Continue dismisses
// it so the player can keep playing; Start Over wipes the save.
export function Ending({
  routes,
  cash,
  accent,
  onRestart,
  onContinue,
}: {
  routes: number;
  cash: number;
  accent: string;
  onRestart: () => void;
  onContinue: () => void;
}) {
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
      <div style={{ color: accent }}>
        <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: 2, lineHeight: 0.9 }}>0%</div>
        <div style={{ fontSize: 16, opacity: 0.85, letterSpacing: 3 }}>UNOWNED MARKET</div>
      </div>

      <div style={{ maxWidth: 520, fontSize: 15, lineHeight: 1.6, opacity: 0.85, letterSpacing: 0.5 }}>
        <p style={{ margin: 0 }}>
          You own every street now. The map filled in block by block until there was nothing left to
          expand into.
        </p>
        <p style={{ margin: "10px 0 0" }}>
          The last package was delivered by a machine you bought — on a road you no longer drive.
          Congratulations on your optimization.
        </p>
      </div>

      <div style={{ fontSize: 13, letterSpacing: 1, opacity: 0.75, lineHeight: 1.9 }}>
        <div>DAYS RUN {routes}</div>
        <div>CASH BANKED ${cash}</div>
        <div style={{ color: accent }}>MARKET SHARE 100%</div>
      </div>

      {/* TODO(credits): fill in font + SFX credits when finalized. */}
      <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.45, maxWidth: 560, lineHeight: 1.7 }}>
        LAST MILE — GMTK Game Jam 2026 · built with code-drawn micrographics (no generative AI) · UI by
        astryx (MIT)
      </div>

      <div style={{ display: "flex", gap: 14, marginBlockStart: 8 }}>
        <button
          onClick={onContinue}
          style={{
            background: accent,
            color: "#0F0F0F",
            border: `1px solid ${accent}`,
            padding: "10px 22px",
            fontFamily: "inherit",
            fontSize: 12,
            letterSpacing: 2,
            cursor: "pointer",
          }}
        >
          CONTINUE
        </button>
        <button
          onClick={onRestart}
          style={{
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
          START OVER
        </button>
      </div>
    </div>
  );
}
