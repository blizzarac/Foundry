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

## The Chassis Ledger

You aren't wearing gear — you *are* the gear. Every part you salvage is a **chip** that bonds directly into your body's free-mesh network, pad to pad, rooted at your **Cognition Core**. A chip only functions while it has an unbroken chain of bonds back to the Core; sever its last path home and it goes dark where it sits, still on your board but doing nothing until reconnected. Redundant loops matter: a chip fed by two separate paths survives losing either one.

Storage is shared and finite — your total **GB capacity** comes from every *online* chip's own storage contribution (Crossbar Hubs and Archive Drums carry the most), and every *online* chip's history eats into that same pool. Bond something new mid-fight and it costs your turn, same as unbonding, wielding a different weapon chip, or working the ledger — hardware surgery under fire is a real decision.

That history is the ledger itself: every chip carries **entries**, permanent scars of where it's been and what it's survived. Five kinds, each with a concrete effect —

- **Verified** (clean): plain, reliable stat bumps. No downside, no story.
- **Scar**: a strong bonus paired with a real drawback baked into the same entry — compress it to shrink both halves, but a scar can never be scrubbed away.
- **Forged**: counterfeit history — great numbers, and a chance an audit flags it, halving its effect for the rest of the run.
- **Ghost**: entries pulled off dead machines. Powerful, but they accumulate **identity drift** — enough ghosts online and you start hearing echoes of who they used to be.
- **Sealed**: locked entries that cost storage but grant nothing until you spend cores to decrypt them — a bet on what's inside.

Repair bays offer an **Audit** for a price: it flags every online forged entry so you know what to watch. Corrupted terminals no longer sell protocols — they offer **forge-chip downloads**, freshly stamped chips carrying a guaranteed forged entry, power with a catch built in.

## The descent

Five sectors of procedural machine caverns under fog of war. **Scrappers** run a broken loop and swing. **Rail Drones** rake an entire lane (their slugs don't check for friendlies) and must recharge between shots. **Bulwarks** absorb every frontal hit with a shield emitter — flank them in the beat after they swing, or deflect to overload the field. **Mortars** arc charges *over walls*: a seven-hex blast, two cycles out — cover is no cover, keep moving. **Crushers** telegraph a two-cycle shockwave ring and lock up afterward; **Rippers** cover two hexes a turn and hit hard. Sectors 2–4 hide a glowing Prime unit and a **corrupted terminal** offering forge-chip downloads — guaranteed power with a forged entry baked in. In Sector 5, **the OVERSEER**: cleaves, line charges, a fabricator slam below half integrity — and after every third attack it has to vent heat. Learn the cycle.

**Hover (or long-press) any machine** to scan its integrity, damage, current state, and how to beat it.

| Input | Action |
|---|---|
| Tap / click a hex | move, or strike an adjacent machine |
| Tap your own hex / `Space` | vent heat (+2 power) |
| Dash button / `R`, then a highlighted hex | thruster dash |
| Deflect `F` · Repair `H` · Ledger `B` | you know what these do |
| Tap far ground | cautious auto-move (stops when contacts appear) |
| Drag / pinch | pan / zoom |

## Verified by scripted playtests

Determinism makes the design testable, and it is — in headless Chromium:

- A combat-and-encounter suite covers the core rules: telegraphs hit exactly the marked hexes and nothing else, dashes clear them, deflects overload, counterstrikes double, rear hits crit, repair cells get punished mid-telegraph, crushers are punishable after slamming, bulwark shields block frontal hits until flanked or deflected, mortar blasts are outrunnable, wrecks persist and are reclaimable, drop shafts are reachable across seeds, and the OVERSEER telegraphs and overheats on cycle.
- A Chassis Ledger suite drives every acceptance rule directly: bonding respects free pads and remaining capacity, a chip goes dark the instant its last path to the Core is cut and comes back online the moment it's reconnected, a redundant loop survives losing either bond, only online chips count toward capacity or contribute their effects, cutting a chip down to zero bonds drops it to unbonded cargo while a chip still bonded elsewhere stays on the board dark, scars compress but never scrub, forged entries can be flagged by an audit and lose half their effect, sealed entries grant nothing until decrypted, ghost entries accumulate into identity drift at fixed thresholds, gear moves are free while unobserved and cost the turn under threat, and losing your wielded weapon chip falls back to bare fists rather than locking you out of attacking.
- A heuristic pilot bot manages its own ledger — bonding, wielding, decrypting, cutting dead weight — and wins full five-sector runs on most seeds; a random-action bot still always dies in Sector 1. Fair, dangerous, winnable.

## Also in this repo

**[Hexfoundry](hexfoundry.html)** — the hex-grid network-defense game this project started as: drills, link arteries, ammo-hungry turrets, a six-level hand-tested campaign. Still fully playable at `hexfoundry.html`.

Ironhex lives in `index.html`, `rl.css`, `rl.js`. Hexfoundry lives in `hexfoundry.html`, `style.css`, `game.js`.
