# Hexfoundry

A [Mindustry](https://mindustrygame.github.io/)-inspired **network-defense game on a hexagonal grid**. Plain HTML5 canvas, zero dependencies. Plays on desktop and phone touch screens.

**Play it:** open `index.html`, or via GitHub Pages once enabled for this repo.

## The idea

Everything you build must be **connected to your core** through a chain of adjacent structures. Drills only mine while online; their ore travels the network home as pulses. Turrets **consume resources per shot** from your stockpile — defense drains the same pool that builds. Survive 15 waves and the foundry holds.

Why hexagons: your base is a territory of six-way adjacencies, and the *shape* of that territory is the game. Long tentacles to distant ore are cheap but sever easily. Meshes are robust but expensive. Rock chokepoints are worth fighting for. Raiders exist to make you feel all of this.

## The campaign

Random maps put too much of a run's difficulty in the generator's hands, so the game is built around **six fixed, hand-tested levels**, each introducing one new threat:

1. **First Light** — the core loop: drill, link, defend. Forgiving.
2. **Copper Hills** — two fronts and the first brutes; learn to read the wave preview.
3. **Raider Moor** — raiders hunt your network; learn to armor arteries.
4. **The Narrows** — a rock fortress with three gates; learn to funnel. Titanium and the Lance unlock here.
5. **Titan Reach** — far titanium, heavy raids; hold a long supply line.
6. **The Crucible** — the full fifteen-wave arc, finale from every front.

Progress saves in your browser; clearing a level unlocks the next. Every level is verified winnable by scripted playtests (and the early ones by deliberately sloppy ones). **Skirmish** — a random map with the full arc — stays available for replay value.

## How it plays

1. **Drill** (`2`) an ore vein near the core, chaining **Links** (`1`) back to it — watch the pulses flow home.
2. Read the wave preview in the top bar: *what's coming, from where, and when.* Mass **Stings** (`3`) on that approach.
3. Guns eat copper per shot. If your income can't feed your guns, they go quiet mid-wave — the economy IS the defense.
4. From wave 5, **raiders** hunt your network instead of your core. Armor arteries with **Walls** (`5`) — enemies path around obstacles when they can, and chew through when it's genuinely shorter.
5. Titanium only spawns far out. Stretching (and holding) that artery unlocks the **Lance** (`4`) — splash artillery that burns titanium per shot.
6. Feeling ahead? **Call the wave early** for bonus copper. Between waves, everything slowly self-repairs.
7. Wave 15 comes from **every front at once**. You get warned, and extra time to redeploy. Win it and endless mode awaits.

Tools are **one-shot**: after a gesture that places something (a tap, or one drag-stroke painting a line), the tool releases itself, so the very next drag pans the map again — no forgotten-tool misplacements. A whiffed tap (rock, occupied, can't afford) keeps the tool armed for a retry. Hold `Shift` on desktop to keep the tool for repeat placement.

| Desktop | Action |
|---|---|
| Left-click / drag | build (paint), then the tool auto-releases — with no tool, drag pans |
| Right-click / drag, or `X` tool | demolish (60% refund) |
| `1`–`5` | select block · `Shift` keeps the tool after placing |
| Mouse wheel | zoom |
| Middle-drag / Space-drag / `WASD` | pan |
| `P` | pause · `Esc` deselect |

| Touch | Action |
|---|---|
| Tap / drag with a tool selected | build (paint a line), then the tool auto-releases |
| Drag with no tool selected | pan |
| Two-finger pinch | zoom + pan |
| Demolish tool, then tap/drag | remove buildings (60% refund) |

## Under the hood

- Pointy-top hexes, axial coordinates, cube rounding for picking.
- Procedural maps: seeded value-noise terrain, random-walk ore veins, reachability-checked spawn points spread around the rim.
- **Connectivity** is a BFS from the core across conducting buildings; its parent tree is the path resource pulses follow home. Cut an artery and everything downstream goes dark — in-flight cargo is lost.
- **Pathfinding** is two Dijkstra flow fields where buildings cost extra (walls most of all): one seeded at the core (grunts, brutes), one multi-seeded at all your structures (raiders). Enemies route around defenses, or breach them when that's genuinely shorter. Both fields recompute on every build/destroy.
- Balance is tuned against scripted bots in headless Chromium: a competent bot (BFS link routing, threat-side turret placement, walls) must clear every campaign level; a naive bot (six turrets, no walls, no preview-reading) must clear the first three and fail from The Narrows on.
- Raiders that harass the periphery too long enrage and charge the core, so no wave can be stalled forever by rebuilding sacrificial bait.

Everything lives in three files: `index.html`, `style.css`, `game.js`.
