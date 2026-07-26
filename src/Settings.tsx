import { useState } from "react";
import { sfxEnabled, setSfxEnabled, type SfxName } from "./audio";

const SFX_ROWS: { name: SfxName; label: string }[] = [
  { name: "deliver", label: "delivery complete" },
  { name: "purchase", label: "upgrade bought" },
  { name: "route", label: "day ended" },
];

// Gear-button modal: Settings (volume + reset + cheats) and About tabs. Micrographic
// styling via inline styles (like Intro/Ending), accent-tinted from the player's color.
export function Settings({
  accent,
  volume,
  onVolume,
  onReset,
  onForceEndDay,
  onCheatRestart,
  onClose,
}: {
  accent: string;
  volume: number;
  onVolume: (v: number) => void;
  onReset: () => void;
  onForceEndDay: () => void;
  onCheatRestart: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"settings" | "about">("settings");
  const [confirmReset, setConfirmReset] = useState(false);
  const [sfx, setSfx] = useState(() => ({
    deliver: sfxEnabled("deliver"),
    purchase: sfxEnabled("purchase"),
    route: sfxEnabled("route"),
  }));
  const toggleSfx = (name: SfxName) => {
    const on = !sfx[name];
    setSfxEnabled(name, on);
    setSfx((s) => ({ ...s, [name]: on }));
  };

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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <span style={{ fontSize: 13, letterSpacing: 1 }}>VOLUME</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end" }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(volume * 100)}
                  onChange={(e) => onVolume(Number(e.target.value) / 100)}
                  style={{ width: 160, accentColor: accent, cursor: "pointer" }}
                />
                <span style={{ fontSize: 12, opacity: 0.7, width: 36, textAlign: "right" }}>{Math.round(volume * 100)}%</span>
              </div>
            </div>
            {/* Per-sound toggles so annoying chirps can be silenced individually. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, letterSpacing: 2, color: "#8C877B" }}>SOUNDS</span>
              {SFX_ROWS.map((row) => (
                <button
                  key={row.name}
                  onClick={() => toggleSfx(row.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    fontFamily: "inherit",
                    fontSize: 12,
                    letterSpacing: 0.5,
                    color: sfx[row.name] ? "#ECE7DA" : "#57534A",
                  }}
                >
                  <span>{row.label}</span>
                  <span>{sfx[row.name] ? "☑" : "☐"}</span>
                </button>
              ))}
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

            {/* Cheats: dev/testing shortcuts, grouped + divided off at the bottom. */}
            <div style={{ borderTop: "1px solid rgba(236,231,218,0.15)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              <span style={{ fontSize: 11, letterSpacing: 2, color: "#8C877B" }}>CHEATS</span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, letterSpacing: 1 }}>FORCE END DAY</span>
                <button style={btn("#ECE7DA")} onClick={onForceEndDay} title="End the current day now — no completion bonus">
                  End Day
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, letterSpacing: 1 }}>RESTART W/ $50K</span>
                <button style={btn("#ECE7DA")} onClick={onCheatRestart} title="Wipe progress and restart with $50,000">
                  Restart
                </button>
              </div>
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
