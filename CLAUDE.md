# Repo notes for Claude

## Git workflow

- Always push finished work directly to `main` (fast-forward from the working
  branch is fine). No pull requests unless explicitly requested.
- Before every push that ships a change, bump `DEPLOY_TIME` in `rl.js`
  (right next to `GAME_VERSION`) to the actual current UTC time (`date -u
  +"%Y-%m-%dT%H:%M:%SZ"`). It drives the "deployed ..." footer note on the
  intro/menu page — GitHub Pages serves this repo directly with no build
  step, so the last commit to `main` genuinely is the last deployment, and
  the badge is only honest if this gets bumped every time.

## Project layout

- **Ironhex** (main game): `index.html`, `rl.css`, `rl.js` — single-file
  vanilla-JS hex roguelike, no build step, no dependencies.
- **`config.js`**: enemy base stats/scaling, prologue floor tables, Foundry
  sector-generation coefficients (pack density, elite bump tiers, chest/
  terminal odds, key-drop odds, gate jump size, the band→gate-boss
  mapping, apex-node tuning, key mods, and the post-ladder open-endgame
  rule: once the tier cap tops out, keyDropAheadPostLadder lets a tier-n
  sector drop keys up to n+1 uncapped — tiers are infinite, sustained by
  drops while fabrication stays capped at the ladder; past it enemy
  stats also gain the compounding enemies.scaling.postLadder multiplier,
  so exponential tiers beat linear gear and every build hits a wall
  eventually), the whole
  economy (restocks, orb prices, orb loot-drop weights, gamble cost, key
  fab curve, item/key salvage formulas, plus the retired shop upgrades
  kept only as migration-refund data), the frame lattice (points per
  purge/gate and every tree node: branch, edges, stat magnitudes, each
  notable's or special's mech key + power — the mech *implementations*
  are combat code in rl.js, keyed by the closed TREE_MECH_KEYS set the
  validator enforces; the root cluster's three special attacks are
  mech-keyed the same way, just with no `requires` and mutually
  exclusive like keystones), item/affix/rarity
  tables (base type stats,
  every implicit's roll range plus the depth-scaling coefficient that
  widens it, prefix/suffix pools and their tier magnitudes — plus a slot
  restriction each could carry, currently unused — the affix deep-scaling
  coefficient that grows those magnitudes linearly past the ladder's
  depth, corrupted-downside
  mods, affix-tier depth bands, uniques, crafting caps), small combat constants
  (dash range, FOV, dash/deflect cost bounds, repair-cell heal, the shared
  detonation-on-death damage, the root specials' shared power cost/range/
  damage multiplier), and node-event tuning (density/weights,
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
  `node tests/tree-smoke.js` (frame lattice: point grants, allocation
  graph, every mech notable's combat branch, keystone exclusivity,
  v5/v6 migration refunds, the root cluster's three special attacks —
  exclusivity, cost/mode gating, and each one's real damage/movement
  resolution inside a sector),
  `node tests/boss-smoke.js` (gate guardian ladder: band→boss config
  mapping, every WARDEN/CRUCIBLE/FORGE-PRIME verb and phase, apex node
  lifecycle and rewards),
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
  the shapes documented in rl.js's persistence section. The same export
  also carries `lastOutcome` (top-level, and its source of truth at
  `campaignMeta.lastOutcome`): the single most recent death or win —
  kind/sub, tier, biome/boss, killing-blow cause, turn/kill counts,
  cores, hp, key rarity/mods, equipped loadout — written by
  `recordOutcome()` from `dieRun`/`winRun`/`sectorComplete`/`gateCleared`/
  `apexCleared`. It also carries `actions`: the full step-by-step log of
  that one attempt (every move/dash/wait/parry/flask/attack, the hits
  and hurts they caused, pickups, floor descents, each with its turn
  number), written by `logAction()` — a separate, uncapped stream from
  the narrative `log()` calls that feed the visible in-game panel — and
  reset fresh on `newRun()`/`enterNode()` so it's scoped to the attempt
  that produced this outcome, not the whole browsing session. It's one
  attempt's full account, not a multi-run history: a balance question
  spanning several runs still needs each run's own export.
