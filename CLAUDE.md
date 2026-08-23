# Repo notes for Claude

## Git workflow

- Always push finished work directly to `main` (fast-forward from the working
  branch is fine). No pull requests unless explicitly requested.

## Project layout

- **Ironhex** (main game): `index.html`, `rl.css`, `rl.js` — single-file
  vanilla-JS hex roguelike, no build step, no dependencies.
- **Hexfoundry** (legacy tower defense): `hexfoundry.html`, `style.css`, `game.js`.
- Acceptance suites: `npm install playwright-core && node tests/item-smoke.js`
  (items), `node tests/atlas-smoke.js` (Foundry overworld/endgame),
  `node tests/checkpoint-smoke.js` (mid-run save/resume across reloads),
  `node tests/events-smoke.js` (Foundry Anomalies node events),
  `node tests/debug-export-smoke.js` (debug state export/import round-trip),
  and `node tests/balance-smoke.js` (power-curve regression harness —
  prints a TTK/HTD table per tier, run it after any balance change).
  Set `CHROMIUM_PATH` if Playwright can't find a browser.
- Ask a player for a debug export (🐞 icon in-game, or "Export debug state"
  on the menu/death screen) to reproduce a reported bug exactly: import it
  via `RL.importDebugState(jsonText)` + `location.reload()` in a fresh
  session, or just read the JSON directly — `profile`/`runCheckpoint` mirror
  the shapes documented in rl.js's persistence section.
