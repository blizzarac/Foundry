# Repo notes for Claude

## Git workflow

- Always push finished work directly to `main` (fast-forward from the working
  branch is fine). No pull requests unless explicitly requested.

## Project layout

- **Ironhex** (main game): `index.html`, `rl.css`, `rl.js` — single-file
  vanilla-JS hex roguelike, no build step, no dependencies.
- **`config.js`**: enemy base stats/scaling, prologue floor tables, Foundry
  sector-generation coefficients (pack density, elite bump tiers, chest/
  terminal odds, key-drop odds, gate jump size, key mods), the whole
  economy (shop upgrades, restocks, orb prices, gamble cost, key fab curve,
  item/key salvage formulas), item/affix/rarity tables (base type stats,
  every implicit's roll range plus the depth-scaling coefficient that
  widens it, prefix/suffix pools and their tier magnitudes — plus a slot
  restriction each could carry, currently unused — corrupted-downside
  mods, affix-tier depth bands, uniques, crafting caps), small combat constants
  (dash range, FOV, dash/deflect cost bounds, repair-cell heal, the shared
  detonation-on-death damage), and node-event tuning (density/weights,
  Fabricator Surge wave count/interval/soul bonus, Timed Vault lockdown
  cycles, Salvage Convoy hauler count/entry delay, Corrupted Zone radius/
  damage) live here as one plain data object (`window.IRONHEX_CONFIG`),
  loaded by `<script>` before `rl.js` — not a real `.json` file, since
  `fetch()` can't read local disk over `file://` and this game has no
  server or build step. `rl.js` validates the shape at boot and fails
  loudly (console + an on-screen banner) if a section is missing — there
  is no silent fallback to hardcoded defaults, so `config.js` is the one
  place balance numbers live. Item/affix *identity* (slot assignment,
  names, descriptions, and the cleave/reach flags that gate real
  attack-code branches) stays in `rl.js` alongside terrain generators,
  boss attack patterns, and AI, which are behavior and always will be.
- **Hexfoundry** (legacy tower defense): `hexfoundry.html`, `style.css`, `game.js`.
- Acceptance suites: `npm install playwright-core && node tests/item-smoke.js`
  (items), `node tests/atlas-smoke.js` (Foundry overworld/endgame),
  `node tests/checkpoint-smoke.js` (mid-run save/resume across reloads),
  `node tests/events-smoke.js` (Foundry Anomalies node events),
  `node tests/debug-export-smoke.js` (debug state export/import round-trip),
  `node tests/dash-smoke.js` (free-form thruster dash geometry),
  `node tests/config-smoke.js` (proves config.js is the real source of the
  numbers it claims to hold, and that a broken config fails loudly),
  and `node tests/balance-smoke.js` (power-curve regression harness —
  prints a TTK/HTD table per tier, run it after any balance change).
  Set `CHROMIUM_PATH` if Playwright can't find a browser.
- Ask a player for a debug export (🐞 icon in-game, or "Export debug state"
  on the menu/death screen) to reproduce a reported bug exactly: import it
  via `RL.importDebugState(jsonText)` + `location.reload()` in a fresh
  session, or just read the JSON directly — `profile`/`runCheckpoint` mirror
  the shapes documented in rl.js's persistence section.
