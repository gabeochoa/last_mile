import { defineTheme } from "@astryxdesign/core";

// Micrographic art direction as an astryx theme (scoped via <Theme>, so the playable game
// keeps the default neutral theme). Built from the player's chosen accent so the whole UI
// recolors from one value. Lives in its own module so Upgrades.tsx only exports a component
// (React Fast Refresh requires component-only exports).
const mono = { family: "ui-monospace", fallbacks: "SFMono-Regular, Menlo, monospace" };
export const makeMicrographic = (accent: string) =>
  defineTheme({
    name: "micrographic",
    color: { accent, neutralStyle: "neutral" },
    typography: { body: mono, heading: mono, code: mono },
    radius: { base: 0, multiplier: 0 },
    tokens: {
      "--color-background-body": ["#0F0F0F", "#0F0F0F"],
      "--color-background-surface": ["#0F0F0F", "#0F0F0F"],
      "--color-background-card": ["#161616", "#161616"],
      "--color-background-muted": ["#161616", "#161616"],
      "--color-text-primary": ["#ECE7DA", "#ECE7DA"],
      "--color-text-secondary": ["#8C877B", "#8C877B"],
      "--color-text-disabled": ["#57534A", "#57534A"],
      "--color-text-accent": [accent, accent],
      "--color-accent": [accent, accent],
      "--color-on-accent": ["#0F0F0F", "#0F0F0F"],
      "--color-border": ["#ECE7DA26", "#ECE7DA26"],
      "--color-border-emphasized": ["#ECE7DA40", "#ECE7DA40"],
      // Sharp micrographic corners everywhere.
      "--radius-inner": ["0px", "0px"],
      "--radius-element": ["0px", "0px"],
      "--radius-container": ["0px", "0px"],
      "--radius-full": ["0px", "0px"],
    },
  });
