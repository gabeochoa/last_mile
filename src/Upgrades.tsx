import { defineTheme } from "@astryxdesign/core";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";
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
};

function UpgradeEnd({
  item,
  level,
  cash,
  onBuy,
}: {
  item: Upgrade;
  level: number;
  cash: number;
  onBuy: (id: string) => void;
}) {
  if (item.locked) {
    return <Badge label="LOCKED" variant="neutral" />;
  }
  const maxLevel = item.maxLevel ?? 1;
  // one-time upgrades read as OWNED once bought; leveled ones cap at MAX.
  if (level >= maxLevel) {
    return maxLevel === 1 ? (
      <Badge label="OWNED" variant="success" />
    ) : (
      <HStack gap={2} vAlign="center">
        <Badge label={`Lv ${level}`} variant="neutral" />
        <Badge label="MAX" variant="success" />
      </HStack>
    );
  }
  const cost = upgradeCost(item, level);
  const canBuy = item.id != null && cash >= cost;
  return (
    <HStack gap={2} vAlign="center">
      {level > 0 && <Badge label={`Lv ${level}`} variant="neutral" />}
      <Text type="code" color="accent">{`$${cost}`}</Text>
      <Button
        label="BUY"
        size="sm"
        variant="primary"
        isDisabled={!canBuy}
        onClick={item.id != null ? () => onBuy(item.id!) : undefined}
      />
    </HStack>
  );
}

export function Upgrades({ cash, upgrades, onBuy }: UpgradesProps) {
  return (
    <VStack
      width={320}
      height="100vh"
      style={{
        textAlign: "start",
        background: "var(--color-background-surface)",
        borderInlineEnd: "1px solid var(--color-border-emphasized)",
      }}
    >
      {/* Header with registration "+" mark */}
      <VStack
        paddingInline={4}
        paddingBlock={3}
        gap={1}
        style={{ borderBlockEnd: "1px solid var(--color-border-emphasized)" }}
      >
        <HStack justify="between" vAlign="start">
          <Heading level={2} color="accent">FLEET OPS</Heading>
          <Text type="code" color="accent">+</Text>
        </HStack>
        <Text type="supporting">{`UPGRADE SHOP   ·   $${cash}`}</Text>
      </VStack>

      {/* Upgrade buckets */}
      <VStack isScrollable>
        {BUCKETS.map((bucket) => (
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
            {bucket.items.map((item) => {
              const level = item.id != null ? upgrades[item.id] ?? 0 : 0;
              return (
                <ListItem
                  key={item.name}
                  label={item.name}
                  description={item.effect}
                  isDisabled={item.locked}
                  endContent={<UpgradeEnd item={item} level={level} cash={cash} onBuy={onBuy} />}
                />
              );
            })}
          </List>
        ))}
      </VStack>

      {/* Footer */}
      <VStack
        paddingInline={4}
        paddingBlock={3}
        style={{ borderBlockStart: "1px solid var(--color-border-emphasized)" }}
      >
        <Text type="supporting">{`DRIVERS ${upgrades.fleet ?? 0}   ·   AUTOPILOT ${(upgrades.autopilot ?? 0) > 0 ? "ON" : "—"}`}</Text>
      </VStack>
    </VStack>
  );
}
