import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { defineTheme } from "@astryxdesign/core";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { List } from "@astryxdesign/core/List";
import { BUCKETS, nextCost, buyoutDiscount, fmtNum, contractPerDriver, dayBonusReward, type Upgrade } from "./config";

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
  perSec?: number; // income/sec, for the "…until affordable" tooltip
  takeover?: number; // lifetime poached-stop count, discounts the Buy Out Rivals price
  buyoutColor?: string; // next rival company's color, tints the Buy Out Rivals button
  hideCompleted: boolean;
  onHideCompleted: (v: boolean) => void;
  footer?: ReactNode;
};

// seconds -> "M:SS" (or "Hh MM" for long waits)
function untilStr(seconds: number): string {
  const s = Math.ceil(seconds);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Action slot: LOCKED / OWNED / MAX badge, or a buy button whose label IS the
// price. The current level shows inline with the title instead (see the row).
function UpgradeEnd({
  item,
  level,
  maxLevel,
  cash,
  takeover,
  onBuy,
  setTip,
  accentOverride,
}: {
  item: Upgrade;
  level: number;
  maxLevel: number;
  cash: number;
  takeover: number;
  onBuy: (id: string) => void;
  setTip: (t: { x: number; y: number; text?: string; cost?: number } | null) => void;
  accentOverride?: string;
}) {
  if (item.locked) {
    return <Badge label="LOCKED" variant="neutral" />;
  }
  const cost = nextCost(item, level, takeover);
  const full = level >= maxLevel;
  // permanent MAX/OWNED (not a soft cap) shows a badge, no button
  if (full && !item.softCap) {
    return <Badge label={maxLevel === 1 ? "OWNED" : "MAX"} variant="success" />;
  }
  const canBuy = !full && item.id != null && cash >= cost;
  // overriding --color-accent recolors the astryx primary button (e.g. Buy Out Rivals
  // tinted by the next company's color).
  const style = accentOverride ? ({ ["--color-accent" as string]: accentOverride } as CSSProperties) : undefined;
  const btn = (
    <span style={style}>
      <Button
        label={`$${fmtNum(cost)}`}
        size="sm"
        variant="primary"
        isDisabled={!canBuy}
        onClick={canBuy && item.id != null ? () => onBuy(item.id!) : undefined}
      />
    </span>
  );
  if (canBuy) return btn;
  // disabled → custom tooltip: soft-cap = static text; can't-afford = live cost (the
  // parent renders "$X more (M:SS until)" from current cash + income).
  const tipData = full
    ? { text: item.capHint ?? "No empty delivery spots — buy out rivals or expand the map." }
    : { cost };
  return (
    <span
      style={{ display: "inline-flex" }}
      onMouseMove={(e) => setTip({ ...tipData, x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setTip(null)}
    >
      {btn}
    </span>
  );
}

export function Upgrades({ cash, upgrades, onBuy, maxLevels, perSec = 0, takeover = 0, buyoutColor, hideCompleted, onHideCompleted, footer }: UpgradesProps) {
  const [tip, setTip] = useState<{ x: number; y: number; text?: string; cost?: number } | null>(null);
  // A buy can remove/replace the hovered button before its onMouseLeave fires, leaving
  // the tooltip stuck. Clear it whenever the upgrade set changes.
  useEffect(() => setTip(null), [upgrades]);

  // Newly-unlocked rows animate IN (start collapsed, then expand) instead of popping.
  const isVisible = (i: Upgrade) =>
    (!i.requires || (upgrades[i.requires] ?? 0) >= (i.requiresLevel ?? 1)) &&
    (!i.requiresAny || i.requiresAny.some((x) => (upgrades[x] ?? 0) >= 1));
  const seenRef = useRef<Set<string>>(new Set());
  const [, forceSeen] = useState(0);
  const visibleNames = BUCKETS.flatMap((b) => b.items).filter(isVisible).map((i) => i.name);
  useEffect(() => {
    let added = false;
    for (const n of visibleNames) if (!seenRef.current.has(n)) { seenRef.current.add(n); added = true; }
    if (added) forceSeen((x) => x + 1); // re-render so first-seen rows transition open
  });
  // live tooltip body: static text, or a "$X more (M:SS until)" that updates as cash rises
  const tipBody = (): string => {
    if (!tip) return "";
    if (tip.text) return tip.text;
    const need = (tip.cost ?? 0) - cash;
    if (need <= 0) return "Ready to buy";
    return `Need $${fmtNum(need)} more` + (perSec > 0 ? ` (${untilStr(need / perSec)} until)` : "");
  };
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
          onChange={onHideCompleted}
        />
      </HStack>

      {/* Upgrade buckets — flex:1 + minHeight:0 so this region scrolls within the
          100vh column instead of pushing the header/footer off-screen. */}
      <VStack isScrollable style={{ flex: 1, minHeight: 0 }}>
        {BUCKETS.map((bucket) => {
          // hide upgrades whose prerequisite isn't owned yet, then optionally completed ones
          const visible = bucket.items.filter(isVisible);
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
                  ? `$${fmtNum(dayBonusReward(level))}/day → $${fmtNum(dayBonusReward(level + 1))}`
                  : item.id === "surge"
                  ? `×${fmtNum(1.5 ** level)} → ×${fmtNum(1.5 ** (level + 1))} contract pay`
                  : item.id === "contracts"
                  ? `a driver switches to Uber · +$${fmtNum(Math.round(contractPerDriver(upgrades)))}/second`
                  : item.id === "buyout" && takeover > 0
                  ? `${Math.round(buyoutDiscount(takeover) * 100)}% off — you've poached ${takeover} rival ${takeover === 1 ? "stop" : "stops"}`
                  : item.effect;
              // Done+hide-complete rows collapse OUT; brand-new rows start collapsed and
              // animate IN — both via the same max-height/opacity transition (no popping).
              const hidden = hideCompleted && isDone(item);
              const collapsed = hidden || !seenRef.current.has(item.name);
              return (
                <div
                  key={item.name}
                  style={{
                    overflow: "hidden",
                    maxHeight: collapsed ? 0 : 120,
                    opacity: collapsed ? 0 : 1,
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
                      <UpgradeEnd item={item} level={level} maxLevel={maxLevelFor(item)} cash={cash} takeover={takeover} onBuy={onBuy} setTip={setTip} accentOverride={item.id === "buyout" ? buyoutColor : undefined} />
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
          {tipBody()}
        </div>
      )}
    </VStack>
  );
}
