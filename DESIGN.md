# Last Mile — design

GMTK Game Jam 2026. Theme: **COUNT DOWN**. Deadline **July 26 1PM**.

## What it is
An incremental / idle **delivery-dispatch** clicker. You play the dispatcher /
fleet manager of a last-mile delivery operation — mostly managing and watching
numbers fall. Drive manually for the first loop or two, then automate everything.

Fictional quirky brand. **No generative-AI art/audio** (jam DQ rule). Visuals
come from a **UI component library (astryx)** + code-drawn canvas shapes; audio
from free packs (credited). Using libraries is allowed; only AI-*generated*
assets are banned — a component library is how we get a polished look without
making/generating art.

## Stack (built from scratch on top of libraries)
- **Vite + React 19 + TypeScript**, **astryx** design system (`@astryxdesign/core`
  + `@astryxdesign/theme-neutral`), MIT / `facebook/astryx`. vitest for tests,
  localStorage for saves. HMR = the fast-feedback DX we wanted.
- Game logic is framework-agnostic plain TS modules (state/config/economy/loop/
  save/input/audio); React+astryx render the UI; a `<canvas>` renders the map.
- astryx rules: components not `<div>`; tokens not hex/px; discover via
  `npx @astryxdesign/cli` (see `.claude/CLAUDE.md`).

## The countdown (theme = "everything counts down")
- **Quota → 0**: packages left this shift; clearing it banks cash + next shift.
- **Days until the Last Mile → 0**: meta clock; each prestige ("a day") automates
  more of the world. At 0 → ending.
- **Humans remaining → 0** + planet coverage → 100%: automate everything, remove
  humans, take over the planet (Amazon's logical endgame). Quota, days, humans —
  all tick toward zero.

## Core loop & progression
1. Manual: drive a van (arrows), SPACE to deliver → quota drops, cash in.
2. Self-driving → auto-dispatch → hire drivers (slower auto-vans) → new routes.
3. Economy: cash (in-run) + prestige tokens (permanent multipliers).

## UI: the "operational control center" (dispatch board)
Modeled on real dispatch software (Onfleet/Samsara look), built with astryx:
- **Top alert bar**: the countdowns (packages left, days left, humans left) +
  active routes + alerts.
- **Sidebar**: driver roster + unassigned orders (lists/rows, StatusDot for
  state: gray unassigned / blue assigned / green done / red delayed).
- **Main canvas**: the map with van icons + delivery pins + route polylines.
- **Detail modals**: click a driver/pin for granular info (proof-of-delivery,
  ETA), upgrades.

## Map — OPEN DECISION (Phase 1)
Real map data is too heavy to bundle (OSM = GB) — user's size worry is valid.
Leaning **procedural / WFC fake city** (zero data, no network, no permissions,
full stylistic control, matches no-AI-art, scales with prestige = "take over the
planet"). Optional cheap flavor: let the player name/"detect" their city as a
text label only (no real map tiles). Decision pending.

## Phases
- **P0 Setup** ✅ — Vite+React+astryx building; logic-module stubs; vitest green;
  repo pushed (`github.com/gabeochoa/the_last_mile`).
- **P1 Core loop** — dispatch board UI + drive/deliver + quota→0 + shift banking.
- **P2 Incremental** — upgrades + auto-delivery + save/offline.
- **P3 Meta/theme/ending** — days→0, prestige, humans/planet counters, ending, juice.
- **P4 Ship** — `vite build`, zip `dist/` → itch, credits, playtest.

## Reference (do not copy code)
`~/p/scrubdaddy` (user's own incremental game), `~/p/mine` (p5 ECS) — patterns only.
