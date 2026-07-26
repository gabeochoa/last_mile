import { useState } from "react";

// Gear-button modal: Settings (sound + reset) and About tabs. Micrographic styling
// via inline styles (like Intro/Ending), accent-tinted from the player's brand color.
export function Settings({
  accent,
  muted,
  onToggleMute,
  onReset,
  onForceEndDay,
  onClose,
}: {
  accent: string;
  muted: boolean;
  onToggleMute: () => void;
  onReset: () => void;
  onForceEndDay: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"settings" | "about">("settings");
  const [confirmReset, setConfirmReset] = useState(false);

  const tabStyle = (active: boolean) => ({
    background: "transparent",
    border: "none",
    borderBottom: `2px solid ${active ? accent : "transparent"}`,
    color: active ? accent : "#8C877B",
    fontFamily: "inherit",
    fontSize: 13,
    letterSpacing: 2,
    padding: "8px 4px",
    cursor: "pointer",
  });
  const btn = (color: string): React.CSSProperties => ({
    background: "transparent",
    border: `1px solid ${color}`,
    color,
    fontFamily: "inherit",
    fontSize: 12,
    letterSpacing: 1,
    padding: "6px 14px",
    cursor: "pointer",
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "rgba(0,0,0,0.6)",
        fontFamily: "ui-monospace, Menlo, monospace",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "90vw",
          background: "#0F0F0F",
          border: "1px solid rgba(236,231,218,0.25)",
          color: "#ECE7DA",
          padding: 24,
        }}
      >
        {/* Header: tabs + close */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, borderBottom: "1px solid rgba(236,231,218,0.15)", marginBottom: 20 }}>
          <button style={tabStyle(tab === "settings")} onClick={() => setTab("settings")}>SETTINGS</button>
          <button style={tabStyle(tab === "about")} onClick={() => setTab("about")}>ABOUT</button>
          <button
            onClick={onClose}
            style={{ marginInlineStart: "auto", background: "transparent", border: "none", color: "#8C877B", fontFamily: "inherit", fontSize: 16, cursor: "pointer" }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {tab === "settings" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, letterSpacing: 1 }}>SOUND</span>
              <button style={btn(muted ? "rgba(236,231,218,0.4)" : "#ECE7DA")} onClick={onToggleMute}>
                {muted ? "🔇 OFF" : "🔊 ON"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, letterSpacing: 1 }}>FORCE END DAY</span>
              <button style={btn("#ECE7DA")} onClick={onForceEndDay} title="End the current day now — no completion bonus">
                End Day
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, letterSpacing: 1 }}>RESET PROGRESS</span>
              <button
                style={btn(accent)}
                onClick={() => (confirmReset ? onReset() : setConfirmReset(true))}
                onMouseLeave={() => setConfirmReset(false)}
              >
                {confirmReset ? "Are you sure?" : "Reset"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 14, lineHeight: 1.9, opacity: 0.9, textAlign: "center", padding: "12px 0" }}>
            <div style={{ color: accent, fontSize: 22, fontWeight: 700, letterSpacing: 3, marginBottom: 12 }}>LAST MILE</div>
            <div>a tiny incremental game</div>
            <div>
              made by{" "}
              <a href="https://choicehoney.itch.io/" target="_blank" rel="noreferrer" style={{ color: accent }}>
                gabe (choicehoney)
              </a>
            </div>
            <div>for the GMTK Game Jam 2026</div>
          </div>
        )}
      </div>
    </div>
  );
}
