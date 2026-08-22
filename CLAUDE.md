# Repo notes for Claude

## Git workflow

- Always push finished work directly to `main` (fast-forward from the working
  branch is fine). No pull requests unless explicitly requested.

## Project layout

- **Ironhex** (main game): `index.html`, `rl.css`, `rl.js` — single-file
  vanilla-JS hex roguelike, no build step, no dependencies.
- **Hexfoundry** (legacy tower defense): `hexfoundry.html`, `style.css`, `game.js`.
- Acceptance suites: `npm install playwright-core && node tests/item-smoke.js`
  (items), `node tests/atlas-smoke.js` (Foundry overworld/endgame), and
  `node tests/checkpoint-smoke.js` (mid-run save/resume across reloads).
  Set `CHROMIUM_PATH` if Playwright can't find a browser.
