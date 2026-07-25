# the_last_mile

An incremental / idle delivery-dispatch game for **GMTK Game Jam 2026** (theme: **COUNT DOWN**).

You run a last-mile delivery operation. Every route the packages **count down to zero**;
clear them and drive back to the depot to bank cash, buy upgrades, and automate the fleet.
As you take over the market, the **unowned share counts down to zero** — human driving
replaced by self-driving vans and a hired fleet — until you own every route on Earth: the
Last Mile.

## Stack
Vite + React 19 + TypeScript, styled with the **astryx** design system (MIT). Built from
scratch for the jam.

**Pitch:** run a last-mile delivery op where the package quota counts down to
zero every shift — clear it, buy upgrades, and automate the fleet until humans,
days, and quota have all counted down to nothing.

**Controls:** Arrow keys drive, Space delivers — or buy Auto-Deliver / Autopilot
to automate it.

## Develop
```
npm install
npm run dev      # http://localhost:5173  (hot reload)
npm run test     # vitest
npm run build    # -> dist/  (index.html + assets/, relative paths)
```

## Build & submit to itch.io
```
npm run package  # build + zip -> the_last_mile_web.zip (index.html at zip ROOT)
```
Then on itch.io:
1. Create/edit a project, set **Kind of project** to **HTML**.
2. Upload `the_last_mile_web.zip` and tick **This file will be played in the browser**.
3. Set the embed **viewport to ~1280x800**.
4. Enable the **fullscreen button**.
5. Save & view — the game runs standalone in the iframe (assets use relative
   paths via `base: "./"`, so no server config is needed).

## Credits
- **Visuals:** code-drawn micrographic art, no generative AI.
- **Audio:** WebAudio SFX synthesized in code (starts on first input gesture).
- **UI:** components by **astryx** (MIT, github.com/facebook/astryx).
- TODO: credit any fonts if added later.
