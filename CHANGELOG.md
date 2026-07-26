# Last Mile — changelog

## Post-jam fixes (v1.12.0, in progress)
Fixes from GMTK 2026 player feedback.

- **$/day is now a real 3-day average** of measured earnings (it never actually averaged before).
- **Upgrades stop flickering** — once you can afford a cash-gated upgrade it stays visible even if auto-buy spends you back under the threshold.
- **Auto-buy never buys locked upgrades**, and the cart "turn all on" only enables upgrades you've actually unlocked.
- **Export save** now shows the code in a selectable box (works even when the browser blocks clipboard, e.g. Brave).
- **"Hide complete"** no longer hides Buy Out Rivals (its max grows as you expand, so it's never truly finished).

### Balance (mid/late-game stall)
- **Business multipliers now multiply *everything*** — Bookstore ×5, Post Office ×10, Internet ×100 now boost the completion bonus (not just per-delivery pay), so they're a real jump.
- **Contract income cap now scales** with those multipliers instead of a flat $100M/s that pinned total income in the billions.
- **Buying out rivals scales cheaper** (cost growth 1.6 → 1.45), so it doesn't outrun your income mid-game.

<!-- add new entries above this line as we go -->
