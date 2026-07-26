import { useEffect, useMemo, useRef, useState } from "react";
import { Theme } from "@astryxdesign/core";
import { Grid } from "./Grid";
import { Ending } from "./Ending";
import { Intro } from "./Intro";
import { Settings } from "./Settings";
import { Upgrades, makeMicrographic } from "./Upgrades";
import { BUCKETS, nextCost, poachActive, perDelivery, routeBonus, contractIncome, extraPackages, expandLevel, unownedShare, depotCount, vanSpeed, daySpeed, DEFAULT_ACCENT, BASE_PACKAGES, fmtNum, rivalColors, rivalCompanyCount } from "./config";
import { sizeForExpansion } from "./gridLogic";
import { clearSave, load, save } from "./save";
import { initAudioOnFirstGesture, getVolume, playSfx, setVolume } from "./audio";

// ?dev starts flush so the shop + purchases can be exercised/screenshotted.
const DEV = new URLSearchParams(window.location.search).get("dev") !== null;
// ?end forces the ending overlay so it can be screenshotted/tested without grinding.
const END_PREVIEW = new URLSearchParams(window.location.search).get("end") !== null;
// ?intro forces the intro/title overlay so it can be screenshotted/tested.
const INTRO_PREVIEW = new URLSearchParams(window.location.search).get("intro") !== null;

// Eases a displayed value toward target via rAF so countdowns visibly tick. Rounds to
// an integer unless a decimal count is given (the market share reads like 99.99%).
function useAnimatedNumber(target: number, ms = 500, decimals = 0): number {
  const [value, setValue] = useState(target);
  useEffect(() => {
    const start = value;
    if (start === target) return;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - t0) / ms);
      setValue(start + (target - start) * t);
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
    // value read as the animation's start point only when target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// Icon toggle for the top banner; the full name lives in the (title) tooltip.
function BannerBtn({ icon, label, active = true, color, onClick }: { icon: string; label: string; active?: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        background: "transparent",
        border: `1px solid ${color ?? "rgba(236,231,218,0.25)"}`,
        color: active ? color ?? "#ECE7DA" : "rgba(236,231,218,0.4)",
        fontFamily: "inherit",
        fontSize: 14,
        lineHeight: 1,
        padding: "3px 7px",
        cursor: "pointer",
      }}
    >
      {icon}
    </button>
  );
}

export function App() {
  // Resume meta from the last session (skipped in ?dev, which starts flush).
  const [loaded] = useState(() => (DEV ? null : load()));
  // A resumed save counts as "in progress" if any day was run OR any upgrade owned —
  // used to skip the intro and keep the shop revealed so a refresh doesn't look fresh.
  const hasProgress =
    !!loaded && ((loaded.routes ?? 0) > 0 || Object.keys(loaded.upgrades ?? {}).length > 0);
  // Show the title screen on a fresh start; skip in ?dev and when resuming progress.
  const [intro, setIntro] = useState(() => INTRO_PREVIEW || (!DEV && !hasProgress));
  const [cash, setCash] = useState(DEV ? 9999 : loaded?.cash ?? 0);
  const [upgrades, setUpgrades] = useState<Record<string, number>>(loaded?.upgrades ?? {});
  // lifetime count of rival stops poached (see Poach Rivals) — permanently discounts buyouts.
  const [takeover, setTakeover] = useState(loaded?.takeover ?? 0);
  const [stats, setStats] = useState({ packagesLeft: 0, mapPct: 0, routes: loaded?.routes ?? 0, capacity: 0, dayEnded: false });
  // latch: the shop appears once you can afford two upgrades, then stays — and is
  // already shown when resuming a save with progress (so a refresh keeps the shop).
  const [revealed, setRevealed] = useState(DEV || hasProgress);
  const [volume, setVolumeState] = useState(getVolume);
  const [autopilotEnabled, setAutopilotEnabled] = useState(loaded?.autopilotOn ?? true);
  const [autoStartEnabled, setAutoStartEnabled] = useState(loaded?.autoStartOn ?? true);
  const [autoBuyEnabled, setAutoBuyEnabled] = useState(loaded?.autoBuyOn ?? true);
  const [hideCompleted, setHideCompleted] = useState(loaded?.hideComplete ?? false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // bumped by the Settings "force end day" button; Grid ends the current day (no bonus) on change.
  const [forceEndSignal, setForceEndSignal] = useState(0);
  // player's chosen brand color; recolors the whole UI + canvas from one value.
  const [accent, setAccent] = useState(loaded?.accent ?? DEFAULT_ACCENT);
  const theme = useMemo(() => makeMicrographic(accent), [accent]);

  // Current map dims from expansion. Demand Engine's cap = the empty delivery slots
  // in the current grid (open, non-depot, minus rival-held cells), so you can't add
  // more deliveries than there's room for. Grid reports this as stats.capacity.
  const dims = sizeForExpansion(expandLevel(upgrades));
  // Rival companies present (a new one every 5 expansions) and how many you've claimed.
  const companyCount = rivalCompanyCount(expandLevel(upgrades));
  const boughtCount = upgrades.buyout ?? 0;
  const maxLevels: Record<string, number> = {
    demand: Math.max(0, stats.capacity - BASE_PACKAGES),
    // one van per column of the map — expand to field more drivers
    fleet: dims.cols,
    // each Contract reassigns a driver, so you can have at most as many as your fleet
    contracts: upgrades.fleet ?? 0,
    // you can only buy out companies you've expanded far enough to see
    buyout: companyCount,
  };
  // The game is "won" when every purchasable upgrade is maxed (nothing left to buy).
  const allMaxed = BUCKETS.flatMap((b) => b.items).every((it) => {
    if (!it.id || it.softCap) return true; // soft caps (Demand) fluctuate — don't gate the ending
    const max = maxLevels[it.id] ?? it.maxLevel ?? 1;
    return (upgrades[it.id] ?? 0) >= max;
  });
  // Once the map is large, the center HUD reflows to give the grid room.
  const bigMap = Math.max(dims.cols, dims.rows) >= 9;

  // Create/resume the AudioContext on the first user gesture (autoplay policy).
  useEffect(() => initAudioOnFirstGesture(), []);

  // Reveal the shop once you can afford the two cheapest upgrades — enough to make a
  // real first choice, not a single forced buy. Latches on.
  const nextCosts = BUCKETS.flatMap((b) => b.items)
    .map((it) => {
      if (!it.id) return Infinity;
      const lvl = upgrades[it.id] ?? 0;
      const max = maxLevels[it.id] ?? it.maxLevel ?? 1;
      return lvl >= max ? Infinity : nextCost(it, lvl, takeover);
    })
    .sort((a, b) => a - b);
  const canAffordTwo = cash >= (nextCosts[0] ?? Infinity) + (nextCosts[1] ?? Infinity);
  useEffect(() => {
    if (!revealed && canAffordTwo) {
      setRevealed(true);
    }
  }, [canAffordTwo, revealed]);

  // Autosave meta whenever it changes (dev never writes the save). Skipped once a reset
  // is in flight so a late interval tick can't re-save the old state over the fresh one.
  const resettingRef = useRef(false);
  useEffect(() => {
    if (DEV || resettingRef.current) return;
    save({
      version: 1,
      cash,
      upgrades,
      routes: stats.routes,
      accent,
      hideComplete: hideCompleted,
      autopilotOn: autopilotEnabled,
      autoStartOn: autoStartEnabled,
      autoBuyOn: autoBuyEnabled,
      takeover,
    });
  }, [cash, upgrades, stats.routes, accent, hideCompleted, autopilotEnabled, autoStartEnabled, autoBuyEnabled, takeover]);

  const onBuy = (id: string) => {
    const u = BUCKETS.flatMap((b) => b.items).find((it) => it.id === id);
    if (!u) return;
    const level = upgrades[id] ?? 0;
    if (level >= (maxLevels[id] ?? u.maxLevel ?? 1)) return;
    const cost = nextCost(u, level, takeover);
    if (cash < cost) return;
    setCash((c) => c - cost);
    setUpgrades((prev) => ({ ...prev, [id]: level + 1 }));
    playSfx("purchase");
  };

  // Running earnings total (income only — purchases never subtract) for the $/day HUD
  // and passive income; snapshotted per day below.
  const earnedRef = useRef(0);
  // Contracts: passive cash per second. Recreated only when the income figure changes.
  const contractPerSec = contractIncome(upgrades);
  useEffect(() => {
    if (contractPerSec <= 0) return;
    const id = window.setInterval(() => {
      earnedRef.current += contractPerSec;
      setCash((c) => c + contractPerSec);
    }, 1000);
    return () => window.clearInterval(id);
  }, [contractPerSec]);

  // Income per second (sampled), so the shop can show "…until you can afford it".
  const [perSec, setPerSec] = useState(0);
  const lastSecEarnedRef = useRef(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setPerSec(earnedRef.current - lastSecEarnedRef.current);
      lastSecEarnedRef.current = earnedRef.current;
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Ops Manager: once owned, auto-buy the single cheapest affordable, unlocked upgrade
  // on a tick. Held in a ref so the timer (bound once) always sees fresh cash/upgrades.
  const autoBuyStepRef = useRef(() => {});
  autoBuyStepRef.current = () => {
    let best: string | null = null;
    let bestCost = Infinity;
    // Ops Manager never touches TERRITORY (expansion / buyout / depots) — those are
    // deliberate player choices, not something to spend your cash on automatically.
    for (const it of BUCKETS.filter((b) => b.name !== "TERRITORY").flatMap((b) => b.items)) {
      if (!it.id || it.id === "autobuy") continue;
      if (it.requires && (upgrades[it.requires] ?? 0) < (it.requiresLevel ?? 1)) continue;
      if (it.requiresAny && !it.requiresAny.some((x) => (upgrades[x] ?? 0) >= 1)) continue;
      const lvl = upgrades[it.id] ?? 0;
      if (lvl >= (maxLevels[it.id] ?? it.maxLevel ?? 1)) continue;
      const cost = nextCost(it, lvl, takeover);
      if (cost <= cash && cost < bestCost) {
        best = it.id;
        bestCost = cost;
      }
    }
    if (best) onBuy(best);
  };
  useEffect(() => {
    if (!(upgrades.autobuy ?? 0) || !autoBuyEnabled) return;
    const id = window.setInterval(() => autoBuyStepRef.current(), 500);
    return () => window.clearInterval(id);
  }, [upgrades.autobuy, autoBuyEnabled]);

  // Cash EARNED per day: snapshot the running earnings total (see earnedRef) between
  // day completions.
  const [dayRate, setDayRate] = useState(0);
  const lastDayEarnedRef = useRef(0);
  const prevRoutesRef = useRef(stats.routes);
  useEffect(() => {
    if (stats.routes > prevRoutesRef.current) {
      setDayRate(earnedRef.current - lastDayEarnedRef.current);
      lastDayEarnedRef.current = earnedRef.current;
      prevRoutesRef.current = stats.routes;
    }
  }, [stats.routes]);

  // A new rival company (distinct color, never yours) appears every 5 expansions.
  // Memoized so its array reference is stable (the canvas caches keyed on it).
  const companyColors = useMemo(
    () => rivalColors(accent, rivalCompanyCount(expandLevel(upgrades))),
    [accent, upgrades.expand],
  );
  // Each Contracts level reassigns one driver off the grid to contract work.
  const driversOnGrid = Math.max(0, (upgrades.fleet ?? 0) - (upgrades.contracts ?? 0));
  // Planet-wide unowned market share (starts 100%, → 0 when you own every spot).
  const theirShare = unownedShare(upgrades);

  // Show the ending once every upgrade is maxed (or ?end preview). Continue dismisses
  // it and sets keepPlaying so it won't pop again this session.
  const [keepPlaying, setKeepPlaying] = useState(false);
  const [ended, setEnded] = useState(END_PREVIEW);
  useEffect(() => {
    if (allMaxed && !keepPlaying) setEnded(true);
  }, [allMaxed, keepPlaying]);

  const onRestart = (startCash = 0) => {
    // wipe progress and reload; normal reset starts at $0, the cheat restart at $50.
    // keeps your chosen color.
    resettingRef.current = true;
    clearSave();
    save({ version: 1, cash: startCash, upgrades: {}, routes: 0, accent });
    window.location.reload();
  };
  const displayShare = useAnimatedNumber(theirShare, 500, 2);
  const displayPackages = useAnimatedNumber(stats.packagesLeft);
  const displayCash = useAnimatedNumber(cash, 400);

  // Controls hint fades in under the map at the start, then fades out for good once
  // the shop is revealed (by then you know how to play). Its slot keeps a fixed
  // height so showing/hiding it never nudges the map box.
  const [instrShown, setInstrShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setInstrShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  return (
    <Theme theme={theme} mode="dark">
      {/* Top banner: map coverage + cash + routes, pinned across the top. */}
      <div
        style={{
          position: "fixed",
          insetBlockStart: 0,
          insetInlineStart: 0,
          insetInlineEnd: 0,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          paddingInline: 12,
          background: "#0F0F0F",
          borderBlockEnd: "1px solid rgba(236,231,218,0.15)",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 13,
          letterSpacing: 1,
          color: "#ECE7DA",
          zIndex: 2,
        }}
      >
        {/* Stats grouped left so they never collide with the right-hand controls. */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, minWidth: 0 }}>
          <span>DAY {stats.routes + 1}</span>
          {bigMap && <span>DELIVERIES {String(displayPackages).padStart(2, "0")}</span>}
          <span>
            CASH ${fmtNum(displayCash)}
            <span style={{ opacity: 0.6, marginInlineStart: 8 }}>
              {dayRate >= 0 ? "+" : "−"}${fmtNum(Math.abs(dayRate))}/day
            </span>
          </span>
        </div>

        {/* Controls grouped right: autopilot toggle · drivers · SFX · reset */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {driversOnGrid > 0 && (
            <span style={{ fontSize: 12, letterSpacing: 1 }}>DRIVERS {driversOnGrid}</span>
          )}
          {(upgrades.contracts ?? 0) > 0 && (
            <span style={{ fontSize: 12, letterSpacing: 1 }}>CONTRACTS {upgrades.contracts}</span>
          )}
          {(upgrades.autopilot ?? 0) > 0 && (
            <BannerBtn
              icon="🚗"
              label={autopilotEnabled ? "Autopilot: on (click for manual)" : "Autopilot: off (click to resume)"}
              active={autopilotEnabled}
              onClick={() => setAutopilotEnabled((v) => !v)}
            />
          )}
          {(upgrades.autoStart ?? 0) > 0 && (
            <BannerBtn
              icon="🔁"
              label={autoStartEnabled ? "Auto-Start Day: on" : "Auto-Start Day: off"}
              active={autoStartEnabled}
              onClick={() => setAutoStartEnabled((v) => !v)}
            />
          )}
          {(upgrades.autobuy ?? 0) > 0 && (
            <BannerBtn
              icon="🛒"
              label={autoBuyEnabled ? "Ops Manager (auto-buy): on" : "Ops Manager (auto-buy): off"}
              active={autoBuyEnabled}
              onClick={() => setAutoBuyEnabled((v) => !v)}
            />
          )}
          <BannerBtn icon="⚙" label="Settings & about" onClick={() => setSettingsOpen(true)} />
        </div>
      </div>

      {/* Sidebar: fixed on the left, slides + fades in on first reveal. */}
      <div
        style={{
          position: "fixed",
          insetBlockStart: 0,
          insetInlineStart: 0,
          opacity: revealed ? 1 : 0,
          transform: revealed ? "none" : "translateX(-100%)",
          transition: "opacity 400ms ease, transform 400ms ease",
          pointerEvents: revealed ? "auto" : "none",
          zIndex: 1,
        }}
      >
        <Upgrades
          cash={cash}
          upgrades={upgrades}
          onBuy={onBuy}
          maxLevels={maxLevels}
          perSec={perSec}
          takeover={takeover}
          buyoutColor={companyColors[boughtCount]}
          hideCompleted={hideCompleted}
          onHideCompleted={setHideCompleted}
          footer={
            bigMap ? (
              <span style={{ color: accent, fontWeight: 700, fontSize: 22, letterSpacing: 2 }}>
                {displayShare.toFixed(2)}% UNOWNED
              </span>
            ) : undefined
          }
        />
      </div>

      {/* Map: centered; slides right (padding grows) once the sidebar reveals. */}
      <div
        style={{
          minHeight: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 14,
          paddingInlineStart: revealed ? 320 : 0,
          paddingBlockStart: 56,
          transition: "padding 400ms ease",
          fontFamily: "ui-monospace, Menlo, monospace",
          color: "#ECE7DA",
        }}
      >
        {/* Small map: big centered hero + deliveries + instructions above the grid.
            Big map: these reflow into the banner / sidebar, leaving just the grid. */}
        {!bigMap && (
          <>
            {/* Hero countdown: unowned market share — hits 0 when you win. */}
            <div style={{ textAlign: "center", color: accent }}>
              <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: 2, lineHeight: 0.9 }}>
                {displayShare.toFixed(2)}%
              </div>
              <div style={{ fontSize: 16, opacity: 0.85, letterSpacing: 3 }}>
                UNOWNED MARKET ▼
              </div>
            </div>

            {/* Deliveries remaining (secondary) + controls, above the map. */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2, lineHeight: 1 }}>
                {String(displayPackages).padStart(2, "0")}
                <span style={{ fontSize: 12, opacity: 0.7, marginInlineStart: 8, letterSpacing: 1 }}>
                  DELIVERIES LEFT
                </span>
              </div>
            </div>
          </>
        )}

        <Grid
          onEarn={(delta) => {
            earnedRef.current += delta;
            setCash((c) => c + delta);
          }}
          onStats={setStats}
          onPoach={(n) => setTakeover((t) => t + n)}
          autoDeliver={(upgrades.autoDeliver ?? 0) > 0}
          autopilot={(upgrades.autopilot ?? 0) > 0 && autopilotEnabled}
          fleet={driversOnGrid}
          poach={poachActive(upgrades)}
          vanSpeed={vanSpeed(upgrades)}
          daySpeed={daySpeed(upgrades)}
          autoStartDay={(upgrades.autoStart ?? 0) > 0 && autoStartEnabled}
          companyCount={companyCount}
          boughtCount={boughtCount}
          rivalColors={companyColors}
          accent={accent}
          perDelivery={perDelivery(upgrades)}
          routeBonus={routeBonus(upgrades)}
          extraPackages={extraPackages(upgrades)}
          depotCount={depotCount(upgrades)}
          forceEndSignal={forceEndSignal}
          {...dims}
          initialRoutes={loaded?.routes ?? 0}
        />

        {/* Controls hint below the box — fixed-height slot so it never moves the box;
            fades in at the start, fades out once the shop is revealed. */}
        <div style={{ height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: 1,
              opacity: instrShown && !revealed ? 0.55 : 0,
              transition: "opacity 600ms ease",
            }}
          >
            ARROWS DRIVE · SPACE DELIVER · RETURN TO DEPOT
          </div>
        </div>
      </div>

      {settingsOpen && (
        <Settings
          accent={accent}
          volume={volume}
          onVolume={(v) => {
            setVolume(v);
            setVolumeState(v);
          }}
          onReset={() => onRestart(0)}
          onForceEndDay={() => {
            setForceEndSignal((n) => n + 1);
            setSettingsOpen(false);
          }}
          onCheatRestart={() => onRestart(50000)}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {intro && <Intro accent={accent} onPickAccent={setAccent} onStart={() => setIntro(false)} />}
      {ended && (
        <Ending
          routes={stats.routes}
          cash={cash}
          accent={accent}
          onRestart={onRestart}
          onContinue={() => {
            setEnded(false);
            setKeepPlaying(true);
          }}
        />
      )}
    </Theme>
  );
}
