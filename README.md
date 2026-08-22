# Emberhex

A **turn-based hex roguelike with souls-like combat**. Plain HTML5 canvas, zero dependencies, plays on desktop and phones.

**Play it:** open `index.html`, or via GitHub Pages once enabled for this repo.

## The one rule

Combat is **deterministic and fully telegraphed**. Every enemy shows exactly which hexes it will strike next turn — red means *don't be there*. There is no damage RNG anywhere. Every death is a misread, never a dice roll. That's where the skill lives.

## The souls toolkit

- **Stamina** fuels attacks (1), rolls (2) and parries (2). Stepping restores 1, holding your ground restores 2. Overextend and all you can do is walk.
- **Roll** two hexes in a line — through bodies and threatened ground, but never through rock.
- **Parry** as an adjacent enemy strikes: the hit is negated and the attacker staggers for a turn — then make it pay. Ripostes against staggered enemies deal double. A parry into empty air wastes the turn.
- **Backstab**: enemies have facing; strike from the rear arc for bonus damage.
- **The flask** heals but drinking costs the turn — chugging inside a telegraph gets you exactly what you deserve. Three charges, refilled at bonfires.
- **Bonfires** heal, refill, and sell upgrades for souls — but resting stirs the floor back to life.
- **Die**, and the souls you carried stain the floor where you fell — persisted across runs. Your next self can reclaim them. Die again first, and they're gone.

## Choose your weapon

- **Ember sword** — balanced; the knight's answer to everything.
- **Ash dagger** — rolls cost 1 stamina; weak swings, lethal backstabs (+4). Play it like an assassin.
- **Grave axe** — heavy swings cost 2 stamina and cleave a three-hex arc. Every swing is a commitment.

## The descent

Five floors of procedural caverns under fog of war. Hollows shamble and swing. Archers rake whole sightlines (their arrows don't care who's standing in them) and need a breath between shots. **Wardens** block every frontal hit with their shield — flank them in the beat after they swing, or parry to break their guard. **Bellows** lob bombs *over walls*: a seven-hex blast, two turns out — cover is no shelter, keep moving. Brutes telegraph a two-turn ring slam and are wide open after; stalkers lunge and hit hard. Floors 2–4 hide a glowing elite and a **dark shrine** offering pacts — power that always takes something back (+2 damage for −3 max HP, and friends). On floor 5, **the Ashen King**: cleaves, line charges, an ash-summoning slam below half health — and after every third attack he has to catch his breath. Learn the cycle.

**Hover (or long-press) any enemy** to read its moveset, health, and what it's about to do.

| Input | Action |
|---|---|
| Tap / click a hex | step, or strike an adjacent enemy |
| Tap your own hex / `Space` | hold ground (+2 stamina) |
| Roll button / `R`, then a highlighted hex | dodge-roll |
| Parry `F` · Flask `H` | you know what these do |
| Tap far ground | cautious auto-walk (stops when danger appears) |
| Drag / pinch | pan / zoom |

## Verified by scripted playtests

Determinism makes the design testable, and it is — in headless Chromium:

- Sixteen scenario suites assert the rules: telegraphs hit exactly the marked hexes and nothing else, rolls clear them, parries stagger, ripostes double, backstabs bonus, flasks get punished mid-telegraph, brutes are punishable after slamming, warden shields block frontal hits until flanked or parried, bellows blobs are outrunnable, axe cleaves and dagger stats apply, shrine pacts trade what they promise, bloodstains persist and are reclaimable, stairs are reachable across seeds, the boss telegraphs and tires on cycle.
- A scripted dodger survives the boss's full attack rotation **without taking a single hit** — proof every telegraph is avoidable.
- A heuristic pilot bot wins full five-floor runs on some seeds and dies on others; a random-action bot always dies on floor 1. Fair, dangerous, winnable.

## Also in this repo

**[Hexfoundry](hexfoundry.html)** — the hex-grid network-defense game this project started as: drills, link arteries, ammo-hungry turrets, a six-level hand-tested campaign. Still fully playable at `hexfoundry.html`.

Emberhex lives in `index.html`, `rl.css`, `rl.js`. Hexfoundry lives in `hexfoundry.html`, `style.css`, `game.js`.
