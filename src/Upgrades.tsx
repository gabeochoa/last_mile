import { useState, type ReactNode } from "react";
import { defineTheme } from "@astryxdesign/core";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { List } from "@astryxdesign/core/List";
import { BUCKETS, upgradeCost, fmtNum, type Upgrade } from "./config";

// Micrographic art direction as an astryx theme (scoped via <Theme>, so the
// playable game keeps the default neutral theme). Built from the player's chosen
// accent so the whole UI recolors from one value.
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

type UpgradesProps = {
  cash: number;
  upgrades: Record<string, number>;
  onBuy: (id: string) => void;
  maxLevels?: Record<string, number>;
  footer?: ReactNode;
};

// Action slot: LOCKED / OWNED / MAX badge, or a buy button whose label IS the
// price. The current level shows inline with the title instead (see the row).
function UpgradeEnd({
  item,
  level,
  maxLevel,
  cash,
  onBuy,
  setTip,
}: {
  item: Upgrade;
  level: number;
  maxLevel: number;
  cash: number;
  onBuy: (id: string) => void;
  setTip: (t: { text: string; x: number; y: number } | null) => void;
}) {
  if (item.locked) {
    return <Badge label="LOCKED" variant="neutral" />;
  }
  const cost = upgradeCost(item, level);
  const full = level >= maxLevel;
  // permanent MAX/OWNED (not a soft cap) shows a badge, no button
  if (full && !item.softCap) {
    return <Badge label={maxLevel === 1 ? "OWNED" : "MAX"} variant="success" />;
  }
  const canBuy = !full && item.id != null && cash >= cost;
  // why is it disabled? (soft-cap grid-full, or can't afford yet)
  const reason = full
    ? "No empty delivery spots — buy out rivals or expand the map."
    : cash < cost
    ? `Need $${fmtNum(cost - cash)} more`
    : null;
  const btn = (
    <Button
      label={`$${fmtNum(cost)}`}
      size="sm"
      variant="primary"
      isDisabled={!canBuy}
      onClick={canBuy && item.id != null ? () => onBuy(item.id!) : undefined}
    />
  );
  if (!reason) return btn;
  // custom tooltip on the disabled button explaining why
  return (
    <span
      style={{ display: "inline-flex" }}
      onMouseMove={(e) => setTip({ text: reason, x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setTip(null)}
    >
      {btn}
    </span>
  );
}

export function Upgrades({ cash, upgrades, onBuy, maxLevels, footer }: UpgradesProps) {
  const [hideCompleted, setHideCompleted] = useState(false);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const maxLevelFor = (item: Upgrade) =>
    (item.id != null ? maxLevels?.[item.id] : undefined) ?? item.maxLevel ?? 1;
  const isDone = (item: Upgrade) => {
    if (item.locked || item.softCap) return false; // soft-capped rows never count as complete
    const level = item.id != null ? upgrades[item.id] ?? 0 : 0;
    return level >= maxLevelFor(item);
  };
  return (
    <VStack
      width={320}
      height="100vh"
      style={{
        textAlign: "start",
        // Clear App's fixed 40px top banner so the header isn't hidden behind it.
        paddingBlockStart: "var(--spacing-10)",
        background: "var(--color-background-surface)",
        borderInlineEnd: "1px solid var(--color-border-emphasized)",
      }}
    >
      {/* Header */}
      <HStack
        paddingInline={4}
        paddingBlock={3}
        gap={3}
        justify="between"
        vAlign="center"
        style={{ borderBlockEnd: "1px solid var(--color-border-emphasized)" }}
      >
        <Heading level={1} color="accent">UPGRADES</Heading>
        <CheckboxInput
          size="sm"
          label="hide complete"
          value={hideCompleted}
          onChange={setHideCompleted}
        />
      </HStack>

      {/* Upgrade buckets — flex:1 + minHeight:0 so this region scrolls within the
          100vh column instead of pushing the header/footer off-screen. */}
      <VStack isScrollable style={{ flex: 1, minHeight: 0 }}>
        {BUCKETS.map((bucket) => {
          // hide upgrades whose prerequisite isn't owned yet, then optionally completed ones
          const visible = bucket.items.filter((i) => {
            if (i.requires && (upgrades[i.requires] ?? 0) < (i.requiresLevel ?? 1)) return false;
            if (i.requiresAny && !i.requiresAny.some((id) => (upgrades[id] ?? 0) >= 1)) return false;
            return true;
          });
          const items = visible;
          // whole bucket gone once every visible item is complete + hide is on
          if (hideCompleted && items.every((i) => isDone(i))) return null;
          return (
          <List
            key={bucket.name}
            density="compact"
            header={
              <Text type="supporting" color="accent" style={{ paddingInline: "var(--spacing-4)" }}>
                {bucket.name}
              </Text>
            }
          >
            {items.map((item) => {
              const level = item.id != null ? upgrades[item.id] ?? 0 : 0;
              // Route Optimization previews the per-delivery payout: current → next.
              const description =
                item.id === "routeOpt"
                  ? `$${1 + level}/delivery → $${1 + level + 1}`
                  : item.id === "dayBonus"
                  ? `$${level * 25}/day → $${(level + 1) * 25}`
                  : item.id === "surge"
                  ? `×${(1.5 ** level).toFixed(1)} → ×${(1.5 ** (level + 1)).toFixed(1)} pay`
                  : item.effect;
              // Hidden (done + hide-complete) rows collapse + fade out instead of popping.
              const hidden = hideCompleted && isDone(item);
              return (
                <div
                  key={item.name}
                  style={{
                    overflow: "hidden",
                    maxHeight: hidden ? 0 : 120,
                    opacity: hidden ? 0 : 1,
                    pointerEvents: hidden ? "none" : undefined,
                    borderBlockEnd: "1px solid var(--color-border)",
                    transition: "max-height 320ms ease, opacity 320ms ease",
                  }}
                >
                  {/* Custom row: ListItem.label is string-only, so build the row with
                      Stacks to keep the level badge inline with the title. */}
                  <VStack gap={1} paddingInline={4} paddingBlock={2}>
                    <HStack justify="between" vAlign="center" gap={2}>
                      <HStack gap={2} vAlign="center">
                        <Text color={item.locked ? "disabled" : "primary"}>{item.name}</Text>
                        {level > 0 && <Badge label={`Lv ${level}`} variant="neutral" />}
                      </HStack>
                      <UpgradeEnd item={item} level={level} maxLevel={maxLevelFor(item)} cash={cash} onBuy={onBuy} setTip={setTip} />
                    </HStack>
                    <Text type="supporting">{description}</Text>
                  </VStack>
                </div>
              );
            })}
          </List>
          );
        })}
      </VStack>

      {footer && (
        <VStack
          paddingInline={4}
          paddingBlock={3}
          hAlign="center"
          style={{ borderBlockStart: "1px solid var(--color-border-emphasized)" }}
        >
          {footer}
        </VStack>
      )}

      {/* Custom tooltip explaining why a disabled buy button can't be pressed. */}
      {tip && (
        <div
          style={{
            position: "fixed",
            left: tip.x + 14,
            top: tip.y + 14,
            zIndex: 50,
            maxWidth: 220,
            padding: "6px 10px",
            background: "var(--color-background-card)",
            border: "1px solid var(--color-border-emphasized)",
            color: "var(--color-text-primary)",
            fontSize: 11,
            letterSpacing: 0.5,
            lineHeight: 1.4,
            pointerEvents: "none",
          }}
        >
          {tip.text}
        </div>
      )}
    </VStack>
  );
}
