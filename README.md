# Hexfoundry

A tiny [Mindustry](https://mindustrygame.github.io/)-inspired base-defense / factory game — on a **hexagonal grid**.

Mine ore with drills, haul it to your core on conveyor chains, and hold off ever-growing enemy waves with turrets and walls. Plain HTML5 canvas, zero dependencies, runs anywhere.

**Play it:** open `index.html`, or via GitHub Pages once enabled for this repo.

## How to play

1. **Drill** (`2`) — place on an ore vein (orange = copper, blue = titanium).
2. **Conveyor** (`1`) — chain from the drill to the golden core. Drag to paint a line; conveyors auto-rotate along your drag. `R` rotates manually.
3. **Sting turret** (`3`) — cheap and fast. Build a few before the first wave hits.
4. **Lance turret** (`4`) — long-range heavy hitter; needs titanium.
5. **Wall** (`5`) — enemies path around obstacles when they can, and chew through them when it's the short way — use walls to funnel them into your turrets.

Enemies pour in from the pulsing red hexes on the map rim and march on your core. Each kill pays a small copper bounty. Waves scale forever; every fourth wave brings brutes. The run ends when the core falls.

| Input | Action |
|---|---|
| Left-click / drag | build (paint) |
| Right-click / drag | demolish (50% refund) |
| `1`–`5` | select block |
| `R` | rotate |
| Mouse wheel | zoom |
| Middle-drag / Space-drag / `WASD` | pan |
| `P` | pause |
| `Esc` | deselect |

## Under the hood

- Pointy-top hexes with axial coordinates; cube rounding for pixel→hex picking.
- Procedural maps: seeded value-noise terrain, random-walk ore veins, reachability-checked spawn points spread around the rim.
- Enemy pathfinding is a Dijkstra flow field from the core where buildings cost extra — so units flow around your defenses, or breach them when that's genuinely shorter. The field recomputes on every build/destroy.
- Conveyor items are positions on a belt with spacing constraints; drills round-robin their output into adjacent belts or the core.

Everything lives in three files: `index.html`, `style.css`, `game.js`.
