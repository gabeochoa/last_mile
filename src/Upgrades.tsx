import { useState } from "react";
import { defineTheme } from "@astryxdesign/core";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { List } from "@astryxdesign/core/List";
import { BUCKETS, upgradeCost, type Upgrade } from "./config";

// Micrographic art direction as an astryx theme (scoped via <Theme>, so the
// playable game keeps the default neutral theme).
const mono = { family: "ui-monospace", fallbacks: "SFMono-Regular, Menlo, monospace" };
export const micrographic = defineTheme({
  name: "micrographic",
  color: { accent: "#E8541E", neutralStyle: "neutral" },
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
    "--color-text-accent": ["#E8541E", "#E8541E"],
    "--color-accent": ["#E8541E", "#E8541E"],
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
};

// Action slot: LOCKED / OWNED / MAX badge, or a buy button whose label IS the
// price. The current level shows inline with the title instead (see the row).
function UpgradeEnd({
  item,
  level,
  maxLevel,
  cash,
  onBuy,
}: {
  item: Upgrade;
  level: number;
  maxLevel: number;
  cash: number;
  onBuy: (id: string) => void;
}) {
  if (item.locked) {
    return <Badge label="LOCKED" variant="neutral" />;
  }
  // one-time upgrades read as OWNED once bought; leveled ones cap at MAX.
  if (level >= maxLevel) {
    return <Badge label={maxLevel === 1 ? "OWNED" : "MAX"} variant="success" />;
  }
  const cost = upgradeCost(item, level);
  const canBuy = item.id != null && cash >= cost;
  return (
    <Button
      label={`$${cost}`}
      size="sm"
      variant="primary"
      isDisabled={!canBuy}
      onClick={item.id != null ? () => onBuy(item.id!) : undefined}
    />
  );
}

export function Upgrades({ cash, upgrades, onBuy, maxLevels }: UpgradesProps) {
  const [hideCompleted, setHideCompleted] = useState(false);
  const maxLevelFor = (item: Upgrade) =>
    (item.id != null ? maxLevels?.[item.id] : undefined) ?? item.maxLevel ?? 1;
  const isDone = (item: Upgrade) => {
    if (item.locked) return false;
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

      {/* Upgrade buckets */}
      <VStack isScrollable>
        {BUCKETS.map((bucket) => {
          const items = hideCompleted ? bucket.items.filter((i) => !isDone(i)) : bucket.items;
          if (items.length === 0) return null;
          return (
          <List
            key={bucket.name}
            density="compact"
            hasDividers
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
                  : item.effect;
              // Custom row: ListItem.label is string-only, so build the row with
              // Stacks to keep the level badge inline with the title while the
              // description spans the full width below.
              return (
                <VStack key={item.name} gap={1} paddingInline={4} paddingBlock={2}>
                  <HStack justify="between" vAlign="center" gap={2}>
                    <HStack gap={2} vAlign="center">
                      <Text color={item.locked ? "disabled" : "primary"}>{item.name}</Text>
                      {level > 0 && <Badge label={`Lv ${level}`} variant="neutral" />}
                    </HStack>
                    <UpgradeEnd item={item} level={level} maxLevel={maxLevelFor(item)} cash={cash} onBuy={onBuy} />
                  </HStack>
                  <Text type="supporting">{description}</Text>
                </VStack>
              );
            })}
          </List>
          );
        })}
      </VStack>
    </VStack>
  );
}
