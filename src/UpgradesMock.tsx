import { Theme, defineTheme } from "@astryxdesign/core";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";

// Micrographic art direction as an astryx theme (scoped via <Theme>, so the
// playable game keeps the default neutral theme).
const mono = { family: "ui-monospace", fallbacks: "SFMono-Regular, Menlo, monospace" };
const micrographic = defineTheme({
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
  },
});

type Upgrade = { name: string; effect: string; level?: number; cost?: number; locked?: boolean };
const BUCKETS: { name: string; items: Upgrade[] }[] = [
  {
    name: "MOVEMENT",
    items: [
      { name: "Momentum Drive", effect: "roll till a wall; you steer", level: 0, cost: 10 },
      { name: "Adaptive Steering", effect: "auto-turns at walls", level: 0, cost: 45 },
    ],
  },
  {
    name: "AUTOMATION",
    items: [
      { name: "Autopilot Module", effect: "self-drives the route", locked: true },
      { name: "Fleet Recruitment", effect: "hire a driver (van on the grid)", locked: true },
    ],
  },
  {
    name: "ECONOMY",
    items: [
      { name: "Demand Engine", effect: "more orders -> more packages", level: 0, cost: 30 },
      { name: "Route Optimization", effect: "+cash per delivery", level: 0, cost: 60 },
    ],
  },
];

function UpgradeEnd({ item }: { item: Upgrade }) {
  if (item.locked) {
    return <Badge label="LOCKED" variant="neutral" />;
  }
  return (
    <HStack gap={2} vAlign="center">
      <Badge label={`Lv ${item.level}`} variant="neutral" />
      <Text type="code" color="accent">{`$${item.cost}`}</Text>
      <Button label="BUY" size="sm" variant="primary" />
    </HStack>
  );
}

export function UpgradesMock() {
  return (
    <Theme theme={micrographic} mode="dark">
      <VStack
        width={320}
        minHeight="100vh"
        style={{
          background: "var(--color-background-surface)",
          borderInlineEnd: "1px solid var(--color-border)",
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
          <Text type="supporting">UPGRADE SHOP</Text>
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
              {bucket.items.map((item) => (
                <ListItem
                  key={item.name}
                  label={item.name}
                  description={item.effect}
                  isDisabled={item.locked}
                  endContent={<UpgradeEnd item={item} />}
                />
              ))}
            </List>
          ))}
        </VStack>

        {/* Footer */}
        <VStack
          paddingInline={4}
          paddingBlock={3}
          style={{ borderBlockStart: "1px solid var(--color-border-emphasized)" }}
        >
          <Text type="supporting">MARKET SHARE 3&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;$/s 0.0</Text>
        </VStack>
      </VStack>
    </Theme>
  );
}
