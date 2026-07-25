# Last Mile — design spec

GMTK Game Jam 2026 · theme **COUNT DOWN** · deadline **July 26 1PM**.
Incremental / idle **delivery-dispatch** game. You take over the entire logistics
market. **Everything counts down** to zero: stops, unowned market share, human
drivers on payroll. Optimize hard for the **Creativity** category.

## Stack
Vite + React 19 + TypeScript + **astryx** (MIT, facebook/astryx) design system.
vitest; localStorage saves. From scratch (no forks). No generative-AI art/audio —
visuals are a UI library + code-drawn canvas; audio from free/self-made assets.

## Visual style — "micrographic"
Generative technical-blueprint / risograph look (Kojima Micro-Graphic Generator).
- Palette: bg `#0F0F0F`, ink `#ECE7DA`, accent `#E8541E`. Micrographic **everything**.
- Registration crosses, 1px frames, dot-matrices, mono plate labels, tick scales.
- **Subtle riso grain** overlay. Motion **snappy/instant**, except covered cells
  **animate an ink/oil spread** as they fill.

## Core loop
- The map is a grid; **one cell = a city block**. Most blocks are empty; a few are
  **special delivery stops**.
- Move (arrow keys). **Packages** sit on a few blocks; pick one up when there
  (press **Space** early; auto once automated) → **+cash**, small pop.
- **Route ends when you return to the depot (start) after collecting every
  package.** Packages remaining → 0 arms completion; then drive back to the start
  cell to finish: quiet tick, **+route bonus cash**, new layout. (The depot is
  highlighted; a "RETURN TO DEPOT" prompt shows once packages are all collected.)
  No per-shift timer.
- Covering the WHOLE map (every reachable block) is an **optional full-coverage
  bonus** — extra cash for completionists, not required. Creates a choice: grab
  packages fast and finish, or fully explore first for the bonus.
- Moving onto a new block earns a little cash (movement income); revisiting =
  pass through, no effect.
- Primary on-screen number = **packages remaining** (counts down to 0). Cash goes
  up; everything else counts down.

## Movement & automation ladder (manual → hands-off)
1. **Snake** (first upgrade, ~1 min in): van keeps rolling in the last direction
   until a wall; you only steer. "Press less."
2. **Auto-turn at walls.**
3. … → **Full self-driving** (mid-game): zero input.
4. **Fully idle** late game — automation even handles special stops.
Driving skill doesn't gate progress (it's flavor). Main decision = **upgrade order**.

## Fleet
- As the grid grows, **hire human drivers**; they autonomously aim for open stops.
- Shown as **more vans on the grid** (all drawn), **individually upgradeable**,
  **fully automatic** (no manual assignment).
- **Human drivers on payroll count DOWN** as automation replaces them → 0. (This
  is the "no humans" theme — the workforce, NOT world population.)

## Economy
- Currency: **Cash ($)**. Earn per stop + a **route-clear bonus**.
- **Order Volume** upgrade: more orders → more stops per route → more money.
- Upgrades: 3 buckets (Movement, Automation, Economy), escalating cost, capped
  per tier. Names are **dry corporate** ("Route Optimization Suite", etc.).
- No third resource (lean).

## Market takeover (the goal)
- The market is held by **many small named rivals** (generic corporate names).
- Headline meter per scope = **UNOWNED share % → 0** (counts down).
- Capture share by **covering routes** AND **buying out rivals** (rival panel with
  buyout buttons, costs cash). Rivals **slowly grow** their share (gentle race, no
  real loss / no fail).
- **Win = unowned share → 0 = total monopoly.**

## Expansion scale (nested countdowns)
Scope tiers: **City → Country → Continent → Earth**. Each tier's unowned% must
drain to 0 before the next unlocks (**sequential**). Tier jump = **zoom out to a
bigger grid** (quick zoom animation). Grid also **grows within a tier**.

## Prestige
- Tokens = **"Market Share"**; spend in a meta shop for **permanent upgrades**.
- Trigger: **at tier jumps + voluntary**. Persists: tokens + meta unlocks
  (run upgrades reset).

## Pacing
- **10–20 min** to the ending. First automation affordable **~1 min** in.
- **Session-only** (no offline earnings) but **autosave + resume** across reloads.
- **Guaranteed ending, no fail state** — gentle/zen.

## Ending
- Triggers at **100% of Earth's market owned** (unowned → 0).
- Tone: **ominous / satirical**. Final beat: **everything fades to numbers/zero,
  UI goes quiet.** Then a **stats + credits card**.

## Narrative
- Delivery method **deferred**. POV = **a single driver** (who automates their own
  job away). Tone = **deadpan corporate satire**.

## UI (dispatch control-center)
- **Split-screen**: top **alert bar** (the countdowns) + **left sidebar** (upgrade
  shop, dense rows) + **main map** (always visible).
- Upgrade **tooltips** via astryx Tooltip. No idle nudges. **No tutorial**
  (discoverable); starts **straight into gameplay** (no title gate).
- **Progressive reveal**: begin with the map **centered, no shop**. When the
  player can first afford the opening upgrade (~$10), the map **slides right** and
  the left upgrade sidebar **fades in**. The UI grows as the game does.
- Numbers: **K/M/B/T**, modest scale (≤ billions); show **$/s and stops/s** rates.

## Map
- **WFC procedural** city generation (stretch goal; **random reachable layouts**
  for now — implemented). Keep features simple (roads + building walls + a few
  scattered special stops). Grid grows within a tier.

## Systems / options
- **Autosave** on an interval; **hard reset** in settings; **`?dev` mode** (fast
  time, free cash, skip tiers) for testing/balancing.
- Input: **arrows only**. Colorblind-safe (shape+label, not color-only). Settings:
  sound, grain, reset. **Respect OS reduced-motion.**
- Audio **deferred** (soft clicks preferred; source free/self-made later).
- Events: **none for now** (positive-only surges later if time; no weather; no
  negative events).

## Brand
- Company: **ZoomZoom / Hustle** (gig-startup satire). Title: **Last Mile**.
- Vehicle: **van → drone** as automation rises.

## Assets (all CC0 — Kenney, credited in-game)
Public-domain, jam-legal (no AI). Tint/recolor to the ink/orange micrographic
palette for cohesion where needed.
- **Board Game Icons** (kenney.nl/assets/board-game-icons) — line icons for UI,
  upgrades, dispatch readouts. Best micrographic fit.
- **Racing Pack** (kenney.nl/assets/racing-pack) — top-down cars for vans/drivers
  on the grid (recolor to accent/ink); van → drone progression.
- **Emotes Pack** (kenney.nl/assets/emotes-pack) — driver reactions / feedback bits.

## Submission
- Pitch: "A minimalist incremental game about automating a delivery empire."
- Priority category: **Creativity**. Build: `vite build` → zip `dist/` (index.html
  at root) → itch. Credits page. No generative AI.
- **First cut if short on time**: rivals/buyouts (keep unowned% draining via
  coverage alone). **Top stretch if ahead**: WFC city generation.

## Prototype status (live at localhost:5173)
`src/Grid.tsx`: 6x6 grid, arrow movement, blocked buildings (random, reachable),
covered-cell fill + countdown (`REMAINING → 0`), route counter, cash (per stop +
route bonus), special stops (Space to collect), Reset. Cash/state local to Grid
(not yet wired to `state.ts`/`economy.ts`). Micrographic style.
