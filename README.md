# Ironhex

A **turn-based hex roguelike with souls-like combat**, set in a dead machine world. You are a salvaged combat frame, five sectors deep in a foundry that never shut down; everything still running down here wants you for parts. Plain HTML5 canvas, zero dependencies, plays on desktop and phones.

**Play it:** open `index.html`, or via GitHub Pages once enabled for this repo.

## The one rule

Combat is **deterministic and fully telegraphed**. Every machine shows exactly which hexes it will strike next cycle — red means *don't be standing there*. There is no damage RNG anywhere. Every death is a misread, never a dice roll. That's where the skill lives.

## The toolkit

- **Power** drives strikes (1), dashes (2) and deflects (2). Moving restores 1, venting heat restores 2. Overdraw your capacitor and all you can do is walk.
- **Dash** two hexes down a line — thrusters carry you straight through bodies and threatened ground, but never through bulkheads.
- **Deflect** as an adjacent machine swings: the hit is negated and the attacker overloads for a cycle — then counterstrike for double. A deflect into empty air wastes the turn.
- **Exposed cores**: machines have facing; strike from the rear arc for critical damage.
- **Repair cells** restore integrity but injecting one costs the turn — patching yourself inside a telegraph gets you exactly what you deserve.
- **Repair bays** heal, refill and fabricate upgrades for cores — but docking reinitializes the sector, and everything you killed comes back.
- **Fall**, and the cores you carried scatter where you died — persisted across runs. Your next frame can reclaim them from the wreck. Fall again first, and they're gone.

## Salvage everything

You boot with a **Scrap Blade** and one shock dart. Everything better is found: glowing **caches** in every sector, guaranteed drops from **elite units**, and a final armory cache before the boss. Weapon bases each play differently — **Blades** balanced, **Shivs** nimble (1-power dashes, +4 into an exposed core), **Cleavers** heavy (2-power plasma discharge across a three-hex arc), **Lances** with reach (strike two hexes down a line) — rolled with damage tiers (*Calibrated*, *Overcharged*, *Prototype*) and affixes (*[Siphon]*: repair on kill · *[Deflector]*: 1-power deflects · *[Servos]*: cheaper dashes). **Modules** (two slots) bend your build: Ablative Plating, Gyro Stabilizer, Targeting Chip, Salvage Protocol, Nanite Regulator. **Tools**: shock darts and power cells.

Your six-slot cargo is free to manage while unobserved — but **with hostiles in sensor range, swapping hardware costs your turn**. Rummaging mid-fight is a real decision.

## The descent

Five sectors of procedural machine caverns under fog of war. **Scrappers** run a broken loop and swing. **Rail Drones** rake an entire lane (their slugs don't check for friendlies) and must recharge between shots. **Bulwarks** absorb every frontal hit with a shield emitter — flank them in the beat after they swing, or deflect to overload the field. **Mortars** arc charges *over walls*: a seven-hex blast, two cycles out — cover is no cover, keep moving. **Crushers** telegraph a two-cycle shockwave ring and lock up afterward; **Rippers** cover two hexes a turn and hit hard. Sectors 2–4 hide a glowing Prime unit and a **corrupted terminal** offering firmware protocols — power that always takes something back (+2 damage for −3 max integrity, and friends). In Sector 5, **the OVERSEER**: cleaves, line charges, a fabricator slam below half integrity — and after every third attack it has to vent heat. Learn the cycle.

**Hover (or long-press) any machine** to scan its integrity, damage, current state, and how to beat it.

| Input | Action |
|---|---|
| Tap / click a hex | move, or strike an adjacent machine |
| Tap your own hex / `Space` | vent heat (+2 power) |
| Dash button / `R`, then a highlighted hex | thruster dash |
| Deflect `F` · Repair `H` · Cargo `B` | you know what these do |
| Tap far ground | cautious auto-move (stops when contacts appear) |
| Drag / pinch | pan / zoom |

## Verified by scripted playtests

Determinism makes the design testable, and it is — in headless Chromium:

- Sixteen scenario suites assert the rules: telegraphs hit exactly the marked hexes and nothing else, dashes clear them, deflects overload, counterstrikes double, rear hits crit, repair cells get punished mid-telegraph, crushers are punishable after slamming, bulwark shields block frontal hits until flanked or deflected, mortar blasts are outrunnable, terminal protocols trade what they promise, wrecks persist and are reclaimable, drop shafts are reachable across seeds, the OVERSEER telegraphs and overheats on cycle — plus the salvage laws: peaceful hardware swaps are free and combat swaps cost the turn, lance reach respects lanes and blockers, cleavers arc, modules apply and reverse cleanly, darts hit the first machine on the lane, caches refuse full cargo, and elites always drop.
- A scripted dodger survives the OVERSEER's full attack rotation **without taking a single hit** — proof every telegraph is avoidable.
- A heuristic pilot bot wins full five-sector runs on most seeds; a random-action bot always dies in Sector 1. Fair, dangerous, winnable.

## Also in this repo

**[Hexfoundry](hexfoundry.html)** — the hex-grid network-defense game this project started as: drills, link arteries, ammo-hungry turrets, a six-level hand-tested campaign. Still fully playable at `hexfoundry.html`.

Ironhex lives in `index.html`, `rl.css`, `rl.js`. Hexfoundry lives in `hexfoundry.html`, `style.css`, `game.js`.
