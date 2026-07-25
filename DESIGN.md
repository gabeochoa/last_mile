# Last Mile — design

GMTK Game Jam 2026. Theme: **COUNT DOWN**. Deadline: **July 26, 1PM** (~2 days).
Engine: C++ + afterhours (ECS) + raylib. Scaffolded from afterhours-template.

## What it is
An incremental / idle "clicker" delivery game. You mostly manage and watch
numbers fall. You drive manually for the first loop or two, then automate
everything and grow a delivery operation.

Fictional quirky brand (no real trademarks). No generative-AI art or audio
(jam rule — instant DQ). Code-drawn shapes + free asset packs (credited) only.

## The countdown (theme = "everything counts down")
- **Quota → 0**: packages left to deliver this shift. Clearing it ends the shift.
- **Days until the Last Mile → 0**: meta clock. Prestige burns a day; at 0 you
  drive your literal last mile → ending. Ties theme + Narrative together.
- Flavor: cash target, timers, etc. all framed as ticking down.

No per-shift time limit — pressure comes from clearing the quota and the days clock.

## Core loop
1. A shift starts with a package quota on a route (small top-down map).
2. Deliver packages until quota hits 0 → shift ends, bank cash.
3. Spend cash on upgrades. Prestige ("clock out for the day") → tokens +
   permanent multipliers, days counter drops by 1.
4. Repeat until days = 0 → ending.

## Progression ladder (manual → automated fleet)
1. **Manual**: arrow keys drive a van around the route; SPACE drops a package
   near a house. You are the only driver.
2. **Self-driving**: upgrade auto-navigates your van to the nearest undelivered
   house (greedy steering, no real pathfinding).
3. **Auto-dispatch**: van loops on its own; you stop touching it.
4. **Hire drivers**: each hire = another auto-van, slower than self-driving;
   adds throughput (idle scaling).
5. **New routes**: unlock new maps with bigger quotas + better pay.
6. **Prestige**: advance a day for permanent multiplier tokens.

## Economy
- **Cash**: in-run currency, escalating upgrade costs.
- **Prestige tokens**: earned on prestige, buy permanent multipliers.

## Map / driving (kept cheap)
- Top-down. Houses = dots, van = rect, free movement (no player pathfinding).
- SPACE delivers when van is near an undelivered house.
- Auto-vans: steer toward nearest undelivered house (greedy). No A*.

## Milestones (cut from the bottom under time pressure)
- **M0** template builds + window + title. *(done)*
- **M1** manual drive: van, houses, SPACE-deliver, quota→0 HUD, shift-end screen.
- **M2** upgrades menu + self-driving + one hired auto-van + persistent cash.
- **M3** days countdown + prestige + new route + ending; sound + juice.
- **M4** itch build (web smoke-tested early) + credits + playtest.

## Build
- Smoke-test raylib→WebAssembly (emscripten) early; desktop as fallback.
- Baseline: `cd ~/p/last_mile && make` (or `xmake build`); exe `output/supermarket.exe`.

## Reference
- `~/p/prime_pressure` — prior Amazon-themed afterhours game (typing/warehouse,
  different mechanic). Mine for ECS/component/system patterns + tone. Has docs/GDD.
- `~/p/break-ross/idea.md` — original world-mapping idea (mostly cut for scope).
</content>
</invoke>
