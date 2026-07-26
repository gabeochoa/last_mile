import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { defineTheme } from "@astryxdesign/core";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { List } from "@astryxdesign/core/List";
import { BUCKETS, nextCost, buyoutDiscount, fmtNum, contractPerDriver, dayBonusReward, perDeliveryAt, type Upgrade } from "./config";

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
  poachFrac?: number; // fraction of current rival territory poached — scales the buyout discount 0..90%
  buyoutColor?: string; // next rival company's color, tints the Buy Out Rivals button
  lastRival?: boolean; // final rival left to buy out — makes the Buy Out Rivals button rainbow + jiggle
  // Ops Manager owned: show a per-upgrade auto-buy checkbox and report toggles up
  autoBuyOwned?: boolean;
  isAutoBuyOn?: (id: string) => boolean;
  onToggleAutoBuy?: (id: string) => void;
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
  poachFrac,
  onBuy,
  setTip,
  accentOverride,
  locked,
  lockedHint,
  lastRival,
}: {
  item: Upgrade;
  level: number;
  maxLevel: number;
  cash: number;
  poachFrac: number;
  onBuy: (id: string) => void;
  setTip: (t: { x: number; y: number; text?: string; cost?: number } | null) => void;
  accentOverride?: string;
  locked?: boolean;
  lockedHint?: string;
  lastRival?: boolean;
}) {
  if (item.locked || locked) {
    const badge = <Badge label="LOCKED" variant="neutral" />;
    if (!lockedHint) return badge;
    // hover the locked badge to learn what unlocks it (e.g. "expand a few more times")
    return (
      <span
        style={{ display: "inline-flex" }}
        onMouseEnter={(e) => setTip({ text: lockedHint, x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => setTip({ text: lockedHint, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setTip(null)}
      >
        {badge}
      </span>
    );
  }
  const cost = nextCost(item, level, { poachFrac, cash });
  const full = level >= maxLevel;
  // permanent MAX/OWNED (not a soft cap) shows a badge, no button
  if (full && !item.softCap) {
    return <Badge label={maxLevel === 1 ? "OWNED" : "MAX"} variant="success" />;
  }
  const canBuy = !full && item.id != null && cash >= cost;
  // overriding --color-accent recolors the astryx primary button (e.g. Buy Out Rivals
  // tinted by the next company's color).
  const style = accentOverride ? ({ ["--color-accent" as string]: accentOverride } as CSSProperties) : undefined;
  // the free Cancel-a-Contract action reads as "Cancel", not a "$0" price
  const label = item.id === "uncontract" ? "Cancel" : `$${fmtNum(cost)}`;
  const btn = (
    <span style={style}>
      <Button
        label={label}
        size="sm"
        variant="primary"
        isDisabled={!canBuy}
        onClick={canBuy && item.id != null ? () => onBuy(item.id!) : undefined}
      />
    </span>
  );
  // Final rival: the button SCREAMS — animated rainbow gradient + gentle jiggle.
  if (canBuy && lastRival && item.id != null) {
    return (
      <>
        <style>{`
@keyframes lm-rainbow { 0% { background-position: 0% 50%; } 100% { background-position: 600% 50%; } }
@keyframes lm-jiggle { 0%,100% { transform: rotate(-1.5deg) translate(0,0); } 25% { transform: rotate(1.5deg) translate(1px,-1px); } 50% { transform: rotate(-1deg) translate(-1px,1px); } 75% { transform: rotate(1deg) translate(1px,1px); } }
`}</style>
        <button
          type="button"
          onClick={() => onBuy(item.id!)}
          style={{
            border: "none",
            borderRadius: 0,
            padding: "var(--spacing-2) var(--spacing-3)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            fontWeight: 700,
            color: "#0F0F0F",
            cursor: "pointer",
            backgroundImage: "linear-gradient(90deg, #ff0000, #ff8a00, #ffee00, #00e000, #00c8ff, #7a5cff, #ff00d4, #ff0000)",
            backgroundSize: "600% 100%",
            animation: "lm-rainbow 3s linear infinite, lm-jiggle 0.4s ease-in-out infinite",
          }}
        >
          {label}
        </button>
      </>
    );
  }
  if (canBuy) return btn;
  // disabled → custom tooltip: soft-cap = static text; can't-afford = live cost (the
  // parent renders "$X more (M:SS until)" from current cash + income).
  const tipData = full
    ? { text: item.capHint ?? "No empty delivery spots — buy out rivals or expand the map." }
    : { cost };
  return (
    <span
      style={{ display: "inline-flex" }}
      onMouseEnter={(e) => setTip({ ...tipData, x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setTip({ ...tipData, x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setTip(null)}
    >
      {btn}
    </span>
  );
}

export function Upgrades({ cash, upgrades, onBuy, maxLevels, perSec = 0, poachFrac = 0, buyoutColor, lastRival = false, autoBuyOwned = false, isAutoBuyOn, onToggleAutoBuy, hideCompleted, onHideCompleted, footer }: UpgradesProps) {
  const [tip, setTip] = useState<{ x: number; y: number; text?: string; cost?: number } | null>(null);
  // A buy can remove/replace the hovered button before its onMouseLeave fires, leaving
  // the tooltip stuck. Clear it whenever the upgrade set changes.
  useEffect(() => setTip(null), [upgrades]);

  // Newly-unlocked rows animate IN (start collapsed, then expand) instead of popping.
  // real prerequisites met (buyable). A cash-gated unlock stays satisfied once owned.
  const meetsReq = (i: Upgrade) =>
    (!i.requires || (upgrades[i.requires] ?? 0) >= (i.requiresLevel ?? 1)) &&
    (!i.requiresAny || i.requiresAny.some((x) => (upgrades[x] ?? 0) >= 1)) &&
    (i.requiresCash == null || cash >= i.requiresCash || (i.id != null && (upgrades[i.id] ?? 0) > 0));
  // shown-but-locked preview once showFrom is reached (so the goal is visible early)
  const showFromMet = (i: Upgrade) => i.showFrom != null && (upgrades[i.showFrom] ?? 0) >= (i.showFromLevel ?? 1);
  const isVisible = (i: Upgrade) => meetsReq(i) || showFromMet(i);
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
    if (item.locked || item.softCap || item.id === "uncontract") return false; // actions/soft-caps never "complete"
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
              // Cancel a Contract is a repeatable free action, not a leveled upgrade — always
              // treat it as level 0 so it never shows a level badge or an "OWNED" state (even
              // if an old save stored a stray level for it).
              const level = item.id === "uncontract" ? 0 : item.id != null ? upgrades[item.id] ?? 0 : 0;
              // Route Optimization previews the per-delivery payout: current → next.
              const rate = (n: number) => n.toFixed(2).replace(/\.?0+$/, "");
              const description =
                item.id === "routeOpt"
                  ? `$${rate(perDeliveryAt(level))}/delivery → $${rate(perDeliveryAt(level + 1))}`
                  : item.id === "dayBonus"
                  ? `$${fmtNum(dayBonusReward(level))}/day → $${fmtNum(dayBonusReward(level + 1))}`
                  : item.id === "surge"
                  ? `×${fmtNum(1.5 ** level)} → ×${fmtNum(1.5 ** (level + 1))} contract pay`
                  : item.id === "contracts"
                  ? `a driver switches to Uber · +$${fmtNum(Math.round(contractPerDriver(upgrades)))}/second`
                  : item.id === "contractBoost"
                  ? `$${fmtNum(Math.round(contractPerDriver(upgrades)))}/contract → $${fmtNum(Math.round(contractPerDriver({ ...upgrades, contractBoost: level + 1 })))}`
                  : item.id === "buyout" && poachFrac > 0
                  ? `${Math.round(buyoutDiscount(poachFrac) * 100)}% off — you've poached ${Math.round(poachFrac * 100)}% of their turf`
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
                      <UpgradeEnd item={item} level={level} maxLevel={maxLevelFor(item)} cash={cash} poachFrac={poachFrac} onBuy={onBuy} setTip={setTip} accentOverride={item.id === "buyout" ? buyoutColor : undefined} lastRival={item.id === "buyout" && lastRival} locked={!meetsReq(item)} lockedHint={item.lockedHint} />
                    </HStack>
                    {/* Second row: description on the left, a tiny auto-buy checkbox under
                        the price button on the right (only once Ops Manager is owned). */}
                    <HStack justify="between" vAlign="center" gap={2}>
                      <Text type="supporting">{description}</Text>
                      {autoBuyOwned && item.id != null && item.id !== "autobuy" && item.id !== "uncontract" && !item.locked && meetsReq(item) && !isDone(item) && (
                        <span style={{ flexShrink: 0 }} title="Auto-buy this with Ops Manager">
                          <CheckboxInput
                            size="sm"
                            label="auto"
                            value={isAutoBuyOn?.(item.id) ?? false}
                            onChange={() => onToggleAutoBuy?.(item.id!)}
                          />
                        </span>
                      )}
                    </HStack>
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
