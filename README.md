# Hexfoundry

A [Mindustry](https://mindustrygame.github.io/)-inspired **network-defense game on a hexagonal grid**. Plain HTML5 canvas, zero dependencies. Plays on desktop and phone touch screens.

**Play it:** open `index.html`, or via GitHub Pages once enabled for this repo.

## The idea

Everything you build must be **connected to your core** through a chain of adjacent structures. Drills only mine while online; their ore travels the network home as pulses. Turrets **consume resources per shot** from your stockpile — defense drains the same pool that builds. Survive 15 waves and the foundry holds.

Why hexagons: your base is a territory of six-way adjacencies, and the *shape* of that territory is the game. Long tentacles to distant ore are cheap but sever easily. Meshes are robust but expensive. Rock chokepoints are worth fighting for. Raiders exist to make you feel all of this.

## How it plays

1. **Drill** (`2`) an ore vein near the core, chaining **Links** (`1`) back to it — watch the pulses flow home.
2. Read the wave preview in the top bar: *what's coming, from where, and when.* Mass **Stings** (`3`) on that approach.
3. Guns eat copper per shot. If your income can't feed your guns, they go quiet mid-wave — the economy IS the defense.
4. From wave 5, **raiders** hunt your network instead of your core. Armor arteries with **Walls** (`5`) — enemies path around obstacles when they can, and chew through when it's genuinely shorter.
5. Titanium only spawns far out. Stretching (and holding) that artery unlocks the **Lance** (`4`) — splash artillery that burns titanium per shot.
6. Feeling ahead? **Call the wave early** for bonus copper. Between waves, everything slowly self-repairs.
7. Wave 15 comes from **every front at once**. You get warned, and extra time to redeploy. Win it and endless mode awaits.

| Desktop | Action |
|---|---|
| Left-click / drag | build (paint) — with no tool selected, drag pans |
| Right-click / drag, or `X` tool | demolish (60% refund) |
| `1`–`5` | select block |
| Mouse wheel | zoom |
| Middle-drag / Space-drag / `WASD` | pan |
| `P` | pause · `Esc` deselect |

| Touch | Action |
|---|---|
| Tap / drag with a tool selected | build (paint a line) |
| Drag with no tool selected | pan |
| Two-finger pinch | zoom + pan |
| Demolish tool, then tap/drag | remove buildings (60% refund) |
| Tap the selected tool again | deselect |

## Under the hood

- Pointy-top hexes, axial coordinates, cube rounding for picking.
- Procedural maps: seeded value-noise terrain, random-walk ore veins, reachability-checked spawn points spread around the rim.
- **Connectivity** is a BFS from the core across conducting buildings; its parent tree is the path resource pulses follow home. Cut an artery and everything downstream goes dark — in-flight cargo is lost.
- **Pathfinding** is two Dijkstra flow fields where buildings cost extra (walls most of all): one seeded at the core (grunts, brutes), one multi-seeded at all your structures (raiders). Enemies route around defenses, or breach them when that's genuinely shorter. Both fields recompute on every build/destroy.
- Balance was tuned against scripted bots in headless Chromium: an AFK player dies on wave 2, a naive static build reaches mid-game, and a competent concentrated defense can clear all 15.

Everything lives in three files: `index.html`, `style.css`, `game.js`.
