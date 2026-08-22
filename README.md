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

## The Arsenal

Loot works like a classic ARPG (Path of Exile style). Five equipment slots — **Weapon**, **Plating**, **Sensor**, **Drive**, **Utility** — and every item is a **base type** (which fixes its slot and implicit modifier) at a **rarity**:

- **Normal** (white): just the base and its implicit. Raw material.
- **Magic** (blue): up to 1 prefix + 1 suffix.
- **Rare** (yellow): up to 2 prefixes + 2 suffixes, with a generated name.
- **Unique** (orange): hand-authored items with fixed, oversized effects — and lore.

Prefixes carry raw power (damage, integrity, rear-strike, repair output, core yield); suffixes carry utility (power reserve, dash and deflect costs, sensor range, heal-on-kill). Modifier values roll in three **tiers**, and deeper sectors roll higher tiers. One modifier per stat per item.

**Currency orbs** are the crafting system, straight from the PoE playbook: **Transmutation** (Normal → Magic), **Augmentation** (add a mod to Magic), **Alchemy** (Normal → Rare), **Regal** (Magic → Rare, keeping its mods), **Exalted** (add a mod to Rare), **Chaos** (swap one mod on a Rare for a new one). Orbs come from caches and elite kills. Swapping gear or crafting is free in peace — under hostile eyes it costs your turn.

Corrupted terminals fabricate **corrupted rares**: strong rolls with a downside modifier baked in, and corruption seals the item against every orb. No take-backs.

## The Foundry (endgame)

Kill the OVERSEER once and the game changes shape: the five-sector descent becomes a one-time prologue, and the **Foundry** opens — an endless overworld hex map of sealed sector nodes spreading outward from your home dock, **the Bay**. Your character is now persistent: frame, gear, currency, and the map itself survive death and browser restarts (saved in `localStorage`).

- **Nodes have no tier — the key is the tier.** Overworld nodes carry only a biome; socket a **Sector Key** (T1–T4 for now) into any frontier node and the sector generates from that node's seed at the *key's* tier, exactly like a PoE2 waystone sets the map level. Cleared nodes remember the tier they were purged at. Keys drop from cleared sectors (always at least one, at tier or tier+1, occasionally pre-modified), and the Bay fabricates plain ones for cores.
- **Keys are craftable items.** The same currency orbs that craft gear craft keys: Transmutation/Alchemy on a plain key, Augmentation/Regal/Exalted/Chaos up the chain — Magic keys hold 2 modifiers, Rares hold 4 (and get generated names). Every key mod trades danger for **bonus loot quantity**: *Swarming* (+50% packs), *Overcharged* (+1 damage), *Armored* (+30% integrity), *Primed* (+1 Prime), *Darkened* (−2 sensor range), *Volatile* (machines detonate on death — 1 damage adjacent, fully deterministic), *Rusted* (repair cells heal −3). Quantity adds caches, orbs from Primes, and extra key-drop chance.
- Every keyed sector has a **purge objective**: kill all its Prime units. Purging a node marks it cleared and reveals its neighbors — the map literally grows as you go.
- **Biomes** shape each sector: Scrapyards (fast salvage packs), Rail Depots (open artillery country), Bastion Lines (dense cover, shielded armor), Archive Vaults (rich caches, live guards).
- **Death costs the key, not the character.** Your frame is rebuilt at the Bay, but the cores you carried stay in the node as a wreck — socket another key into that node to reclaim them. Extraction from a purged sector is free and repairs you fully; attrition lives inside sectors, not between them.

Planned next: gate bosses at tier bands, tiers to 15, node events.

## The descent

Five sectors of procedural machine caverns under fog of war. **Scrappers** run a broken loop and swing. **Rail Drones** rake an entire lane (their slugs don't check for friendlies) and must recharge between shots. **Bulwarks** absorb every frontal hit with a shield emitter — flank them in the beat after they swing, or deflect to overload the field. **Mortars** arc charges *over walls*: a seven-hex blast, two cycles out — cover is no cover, keep moving. **Crushers** telegraph a two-cycle shockwave ring and lock up afterward; **Rippers** cover two hexes a turn and hit hard. Sectors 2–4 hide a glowing Prime unit and a **corrupted terminal** offering corrupted rare gear — guaranteed power with a downside baked in. In Sector 5, **the OVERSEER**: cleaves, line charges, a fabricator slam below half integrity — and after every third attack it has to vent heat. Learn the cycle.

**Hover (or long-press) any machine** to scan its integrity, damage, current state, and how to beat it.

| Input | Action |
|---|---|
| Tap / click a hex | move, or strike an adjacent machine |
| Tap your own hex / `Space` | vent heat (+2 power) |
| Dash button / `R`, then a highlighted hex | thruster dash |
| Deflect `F` · Repair `H` · Gear `B` | you know what these do |
| Tap far ground | cautious auto-move (stops when contacts appear) |
| Drag / pinch | pan / zoom |

## Verified by scripted playtests

Determinism makes the design testable, and it is — in headless Chromium:

- A combat-and-encounter suite covers the core rules: telegraphs hit exactly the marked hexes and nothing else, dashes clear them, deflects overload, counterstrikes double, rear hits crit, repair cells get punished mid-telegraph, crushers are punishable after slamming, bulwark shields block frontal hits until flanked or deflected, mortar blasts are outrunnable, wrecks persist and are reclaimable, drop shafts are reachable across seeds, and the OVERSEER telegraphs and overheats on cycle.
- A Foundry suite (`tests/atlas-smoke.js`) drives the endgame rules: beating the OVERSEER unlocks the overworld with three starter keys and a six-node tier-free frontier ring, any key opens any node and the key's tier alone scales enemy integrity and damage and the Prime count, every key orb works (transmute/aug/alch/regal/exalt/chaos, chaos always swapping in a different mod) and refuses the wrong rarity, forced mod loadouts provably shape the sector (extra Prime, +30% integrity, +1 damage, sensor penalty, loot quantity and cache count), Volatile detonations cost 1 integrity when a machine dies adjacent, purging clears the node with its run tier recorded and reveals neighbors and sustains keys, dying stores cores as a wreck that re-keying places back in the sector, and a full page reload restores character, map, and modified keys.
- An item-system suite (`tests/item-smoke.js`) drives the loot rules directly: Magic items respect the 1-prefix/1-suffix cap and Rares the 2/2 cap, no item ever rolls the same stat twice, every orb does exactly what it says (transmute, augment, alchemy, regal, exalt, chaos) and refuses the wrong rarity, corrupted items reject all orbs, implicits and modifiers apply on equip and revert on unequip, `recalc()` totals always match the sum of equipped items' effects, an equipped item can't be dropped, unequipping the weapon falls back to bare fists, elites drop gear plus two orbs, and the pre-boss armory always holds a rare weapon. Run it with `npm install playwright-core && node tests/item-smoke.js`.

## Also in this repo

**[Hexfoundry](hexfoundry.html)** — the hex-grid network-defense game this project started as: drills, link arteries, ammo-hungry turrets, a six-level hand-tested campaign. Still fully playable at `hexfoundry.html`.

Ironhex lives in `index.html`, `rl.css`, `rl.js`. Hexfoundry lives in `hexfoundry.html`, `style.css`, `game.js`.
