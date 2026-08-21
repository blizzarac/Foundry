/* =========================================================================
   HEXFOUNDRY — a hex-grid network-defense game, Mindustry-inspired.

   The design in one paragraph: everything you build must be CONNECTED to
   your core through a chain of adjacent structures. Drills only mine while
   online; their ore travels as pulses along the network to the core.
   Turrets consume resources per shot from your stockpile — defense drains
   the same pool that builds. Enemies come in three kinds: grunts march on
   the core, brutes tank, and raiders hunt your network's arteries. Survive
   15 waves (previewed, callable early for a bounty) and you win.

   Why hexes: your base is a territory of six-way adjacencies. The SHAPE of
   the network is the game — long tentacles to distant ore are cheap but
   sever easily; meshes are robust but expensive; rock chokepoints are
   worth fighting for.
   ========================================================================= */
"use strict";

/* ---------------------------------------------------------------- utils */
const SQ3 = Math.sqrt(3);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(seed) {
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = t => t * t * (3 - 2 * t);
  const val = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    return lerp(
      lerp(hash(xi, yi), hash(xi + 1, yi), xf),
      lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), xf), yf);
  };
  return (x, y) => 0.65 * val(x, y) + 0.35 * val(x * 2.3 + 31.7, y * 2.3 - 17.3);
}

/* ------------------------------------------------------------- hex math */
const HEX = 24;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const NEIGHBOR_DIST = SQ3 * HEX;

const key = (q, r) => q + "," + r;
const hexX = (q, r) => HEX * (SQ3 * q + SQ3 / 2 * r);
const hexY = (q, r) => HEX * 1.5 * r;
const hexDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

function pixelToHex(x, y) {
  const qf = (SQ3 / 3 * x - y / 3) / HEX;
  const rf = (2 / 3 * y) / HEX;
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}
const HEXPTS = [];
for (let i = 0; i < 6; i++) {
  const a = TAU * (i + 0.5) / 6 + Math.PI / 6;
  HEXPTS.push([Math.sin(a) * HEX, -Math.cos(a) * HEX]);
}
function hexPath(ctx, x, y, scale = 1) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const p = HEXPTS[i];
    if (i === 0) ctx.moveTo(x + p[0] * scale, y + p[1] * scale);
    else ctx.lineTo(x + p[0] * scale, y + p[1] * scale);
  }
  ctx.closePath();
}

/* ------------------------------------------------------------- content */
const RES_COLORS = { copper: "#d99d73", titanium: "#8da7c6" };
const CORE_KEY = key(0, 0);
const PULSE_SPEED = 5;        // hexes per second along the network
const DRILL_TIMES = { copper: 2.0, titanium: 3.2 };

const BLOCKS = {
  core: {
    name: "Core", hp: 1500, cost: {}, conducts: true, buildable: false,
    desc: "Your heart and your bank. Everything must connect back to it.",
  },
  link: {
    name: "Link", hp: 80, cost: { copper: 4 }, conducts: true, key: "1",
    desc: "Cheap connective tissue. Chains your buildings back to the core. Fragile — raiders love cutting these. Armor important arteries with walls.",
  },
  drill: {
    name: "Drill", hp: 110, cost: { copper: 12 }, conducts: true, key: "2", needsOre: true,
    desc: "Place on an ore vein. Mines only while connected to the core; ore travels the network as pulses.",
    stat: "copper 1 per 2s · titanium 1 per 3.2s",
  },
  sting: {
    name: "Sting", hp: 170, cost: { copper: 25 }, conducts: true, key: "3",
    turret: { range: 124, reload: 0.5, dmg: 9, pspeed: 400, ammo: "copper", ammoCost: 0.4, aoe: 0 },
    desc: "Fast light turret. Eats copper from your stockpile with every shot — guns go quiet when the bank runs dry.",
    stat: "9 dmg · 0.4 copper / shot",
  },
  lance: {
    name: "Lance", hp: 240, cost: { copper: 50, titanium: 20 }, conducts: true, key: "4",
    turret: { range: 190, reload: 1.1, dmg: 32, pspeed: 560, ammo: "titanium", ammoCost: 0.6, aoe: 24 },
    desc: "Long-range artillery with splash. Burns titanium per shot — a titanium supply line is a weapon.",
    stat: "32 dmg, splash · 0.6 titanium / shot",
  },
  wall: {
    name: "Wall", hp: 380, cost: { copper: 6 }, conducts: false, key: "5",
    desc: "Inert armor — does NOT conduct. Plate your arteries, plug rock chokepoints, funnel enemies into gunfire. They go around when they can, chew through when it's shorter.",
  },
};
const TOOL_ORDER = ["link", "drill", "sting", "lance", "wall"];

/* -------------------------------------------------------------- levels */
// A campaign of fixed-seed, hand-tested maps with scripted wave tables.
// Random generation decides too much of a run's difficulty; here every
// level is a known quantity, tuned and verified winnable, and each one
// introduces exactly one new threat.
// wv(grunts, raiders, brutes, spawn) — spawn: point index or "all"
const wv = (g, r, b, s) => ({ grunts: g, raiders: r, brutes: b, spawn: s });

const LEVELS = [
  {
    name: "First Light", tagline: "Chain Links to ore, drill it, gun down the raid.",
    seed: 103, mapR: 9, spawnCount: 1, hpMul: 0.85,
    gen: { copper: 6, titanium: 0 },
    start: { copper: 90, titanium: 0 },
    blocks: ["link", "drill", "sting", "wall"],
    waves: [wv(4, 0, 0, 0), wv(6, 0, 0, 0), wv(9, 0, 0, 0), wv(12, 0, 0, 0), wv(15, 0, 0, "all")],
    intro: "Drills mine only while CONNECTED to the core — chain Links back to it.",
  },
  {
    name: "Copper Hills", tagline: "Two fronts. Watch the preview, meet them ready.",
    seed: 214, mapR: 11, spawnCount: 2, hpMul: 0.9,
    gen: { copper: 8, titanium: 0 },
    start: { copper: 80, titanium: 0 },
    blocks: ["link", "drill", "sting", "wall"],
    waves: [wv(5, 0, 0, 0), wv(7, 0, 0, 1), wv(9, 0, 0, 0), wv(10, 0, 1, 1),
            wv(12, 0, 0, 0), wv(14, 0, 1, 1), wv(16, 0, 2, "all")],
    intro: "Brutes are slow and very tough. The wave preview tells you which front is next.",
  },
  {
    name: "Raider Moor", tagline: "They are not coming for the core. They are coming for your arteries.",
    seed: 337, mapR: 12, spawnCount: 2, hpMul: 0.95,
    gen: { copper: 9, titanium: 0 },
    start: { copper: 80, titanium: 0 },
    blocks: ["link", "drill", "sting", "wall"],
    waves: [wv(5, 0, 0, 0), wv(6, 1, 0, 1), wv(8, 1, 0, 0), wv(9, 2, 0, 1),
            wv(10, 2, 1, 0), wv(12, 3, 0, 1), wv(13, 3, 1, 0), wv(15, 4, 2, "all")],
    intro: "Raiders hunt your NETWORK, not your core. Armor exposed links with walls.",
  },
  {
    name: "The Narrows", tagline: "A rock ring with three gates. Make the gates a mistake.",
    seed: 452, mapR: 12, spawnCount: 2, hpMul: 0.95,
    gen: { copper: 8, titanium: 0 },
    start: { copper: 80, titanium: 0 },
    blocks: TOOL_ORDER,
    shape: shapeNarrows,
    waves: [wv(6, 0, 0, 0), wv(8, 0, 0, 1), wv(9, 1, 0, 0), wv(11, 0, 1, 1),
            wv(12, 2, 0, 0), wv(14, 1, 1, 1), wv(15, 2, 1, 0), wv(16, 3, 2, 1),
            wv(18, 3, 2, 0), wv(20, 4, 3, "all")],
    intro: "Enemies must funnel through the gates. Titanium waits outside the ring — the Lance is unlocked.",
  },
  {
    name: "Titan Reach", tagline: "The titanium is far, the raiders many. Hold the line you stretch.",
    seed: 568, mapR: 13, spawnCount: 3, hpMul: 1.0,
    gen: { copper: 8, titanium: 7, titanMin: 9 },
    start: { copper: 80, titanium: 0 },
    blocks: TOOL_ORDER,
    waves: [wv(6, 0, 0, 0), wv(8, 1, 0, 1), wv(10, 1, 0, 2), wv(11, 2, 1, 0),
            wv(12, 3, 0, 1), wv(14, 3, 1, 2), wv(15, 4, 1, 0), wv(16, 4, 2, 1),
            wv(18, 5, 2, 2), wv(19, 5, 2, 0), wv(20, 6, 3, 1), wv(22, 6, 3, "all")],
    intro: "A long artery is a promise you have to keep. The Lance is worth it.",
  },
  {
    name: "The Crucible", tagline: "Everything, from everywhere. The foundry holds — or it doesn't.",
    seed: 691, mapR: 14, spawnCount: 3, hpMul: 1.1,
    gen: { copper: 10, titanium: 6, titanMin: 7 },
    start: { copper: 80, titanium: 0 },
    blocks: TOOL_ORDER,
    waves: null, // formula table, 15 waves — the full arc
    intro: "Fifteen waves. The last one comes from every front at once.",
  },
];

const SKIRMISH = {
  name: "Skirmish", tagline: "A random map, the full 15-wave arc. No two alike.",
  seed: undefined, mapR: 14, spawnCount: 3, hpMul: 1.0,
  gen: { copper: 10, titanium: 6, titanMin: 7 },
  start: { copper: 80, titanium: 0 },
  blocks: TOOL_ORDER,
  waves: null,
  intro: "Uncharted ground. Scout the ore, pick your chokepoints.",
};

// formula table for Crucible/Skirmish — the original tuned 15-wave arc
function formulaWaves() {
  const t = [];
  for (let n = 1; n <= 15; n++) {
    t.push(wv(
      Math.min(4 + Math.round(n * 1.5), 28),
      n >= 5 ? Math.floor((n - 2) / 3) : 0,
      n % 4 === 0 ? Math.floor(n / 4) : 0,
      n === 15 ? "all" : (n - 1) % 3,
    ));
  }
  return t;
}

// The Narrows: a rock ring at distance 6 with three gates, titanium
// seeded outside the ring so reaching it means holding a gate.
function shapeNarrows(g, rng) {
  const gates = [0.4, 2.5, 4.6]; // gate center angles
  const angTo = (t, ga) => {
    const a = (Math.atan2(hexY(t.q, t.r), hexX(t.q, t.r)) + TAU) % TAU;
    const da = Math.abs(a - ga);
    return Math.min(da, TAU - da);
  };
  for (const t of g.tiles.values()) {
    const d = hexDist(t.q, t.r);
    const nearGate = Math.min(...gates.map(ga => angTo(t, ga)));
    // solid two-tile ring...
    if ((d === 6 || d === 7) && nearGate >= 0.26) { t.rock = true; t.ore = null; }
    // ...with guaranteed-open gate passages (noise rock cleared too)
    else if (d >= 5 && d <= 8 && nearGate < 0.26) t.rock = false;
    // clear ambient noise-rock near the ring so the fortress reads clean
    else if (d >= 3 && d <= 9) t.rock = false;
  }
  // titanium pockets beyond the ring, near two of the gates
  for (const t of g.tiles.values()) {
    if (t.rock || t.ore) continue;
    const d = hexDist(t.q, t.r);
    if (d < 9 || d > 11) continue;
    for (const ga of [0.4, 2.5]) {
      if (angTo(t, ga) < 0.22 && rng() < 0.55) t.ore = "titanium";
    }
  }
}

/* ---------------------------------------------------------- game state */
let game = null;

// arg: a level object for campaign play; a number for a seeded skirmish
// (kept for tests); undefined for a random skirmish
function newGame(arg) {
  const level = (arg && typeof arg === "object") ? arg : SKIRMISH;
  const seed = typeof arg === "number" ? arg
    : level.seed !== undefined ? level.seed
    : (Math.random() * 1e9) | 0;
  const waveTable = level.waves ? level.waves : formulaWaves();
  const g = {
    seed,
    level,
    levelIndex: LEVELS.indexOf(level),
    mapR: level.mapR,
    waveTable,
    finalWave: waveTable.length,
    tiles: new Map(),
    buildings: [],
    enemies: [],
    projectiles: [],
    particles: [],
    pulses: [],
    pendingSpawns: [],
    spawnPoints: [],
    res: { copper: level.start.copper, titanium: level.start.titanium },
    wave: 0,
    waveTimer: 60,
    nextWave: null,
    core: null,
    flowCore: new Map(),
    flowStruct: new Map(),
    parents: new Map(),
    time: 0, kills: 0, lost: 0,
    over: false, won: false, endless: false, paused: false,
  };
  genMap(g);
  rebuildNets(g);
  g.nextWave = waveComp(g, 1);
  return g;
}

function genMap(g) {
  const rng = mulberry32(g.seed);
  const noise = makeNoise((g.seed ^ 0x9e3779b9) | 0);
  const R = g.mapR;
  const cfg = g.level.gen;

  for (let q = -R; q <= R; q++) {
    for (let r = -R; r <= R; r++) {
      if (hexDist(q, r) > R) continue;
      const x = hexX(q, r), y = hexY(q, r);
      const n = noise(x * 0.011, y * 0.011);
      const d = hexDist(q, r);
      const rock = n > 0.62 && d > 3 && d < R;
      let floor = "stone";
      if (n < 0.36) floor = "sand";
      else if (n < 0.5) floor = "grass";
      g.tiles.set(key(q, r), {
        q, r, floor, rock, ore: null, building: null,
        shade: (rng() - 0.5) * 0.09,
      });
    }
  }

  const floorTiles = [...g.tiles.values()].filter(t => !t.rock);
  const walkVein = (start, ore, len) => {
    let t = start;
    for (let i = 0; i < len && t; i++) {
      if (!t.rock && hexDist(t.q, t.r) > 1) t.ore = ore;
      const [dq, dr] = DIRS[(rng() * 6) | 0];
      t = g.tiles.get(key(t.q + dq, t.r + dr));
    }
  };
  // copper: one starter vein close in, the rest scattered mid/far
  const near = floorTiles.filter(t => { const d = hexDist(t.q, t.r); return d >= 2 && d <= 4; });
  walkVein(near[(rng() * near.length) | 0], "copper", 7);
  for (let i = 0; i < cfg.copper; i++)
    walkVein(floorTiles[(rng() * floorTiles.length) | 0], "copper", 5 + (rng() * 5) | 0);
  // titanium: always a reach — mid-to-far only, so unlocking the Lance
  // means stretching (and defending) a long artery
  const titanMin = cfg.titanMin || 7;
  for (let i = 0; i < cfg.titanium; i++) {
    const far = floorTiles.filter(t => hexDist(t.q, t.r) >= titanMin);
    walkVein(far[(rng() * far.length) | 0], "titanium", 4 + (rng() * 4) | 0);
  }

  // level-specific terrain sculpting (chokepoints, ore pockets, ...)
  if (g.level.shape) g.level.shape(g, rng);

  const center = g.tiles.get(CORE_KEY);
  center.rock = false; center.ore = null;
  g.core = placeBuilding(g, "core", 0, 0, true);

  // spawn points: reachable rim tiles, spread apart
  const reach = bfsReachable(g, CORE_KEY);
  const rim = [...g.tiles.values()]
    .filter(t => !t.rock && hexDist(t.q, t.r) >= R - 1 && reach.has(key(t.q, t.r)));
  const angleOf = t => Math.atan2(hexY(t.q, t.r), hexX(t.q, t.r));
  const picked = [];
  if (rim.length) {
    picked.push(rim[(rng() * rim.length) | 0]);
    while (picked.length < g.level.spawnCount && picked.length < rim.length) {
      let best = null, bestScore = -1;
      for (const t of rim) {
        const score = Math.min(...picked.map(p => {
          const da = Math.abs(angleOf(t) - angleOf(p));
          return Math.min(da, TAU - da);
        }));
        if (score > bestScore) { bestScore = score; best = t; }
      }
      picked.push(best);
    }
  }
  g.spawnPoints = picked.map(t => ({ q: t.q, r: t.r }));
}

function bfsReachable(g, startKey) {
  const seen = new Set([startKey]);
  const queue = [startKey];
  while (queue.length) {
    const k = queue.pop();
    const t = g.tiles.get(k);
    for (const [dq, dr] of DIRS) {
      const nk = key(t.q + dq, t.r + dr);
      const nt = g.tiles.get(nk);
      if (nt && !nt.rock && !seen.has(nk)) { seen.add(nk); queue.push(nk); }
    }
  }
  return seen;
}

/* --------------------------------------------- network + flow fields */
// Connectivity BFS from the core across conducting buildings. Sets
// b.online and a parent tree that resource pulses follow home.
function computeNetwork(g) {
  g.parents = new Map();
  for (const b of g.buildings) b.online = false;
  if (!g.core) return;
  g.core.online = true;
  const queue = [CORE_KEY];
  const seen = new Set([CORE_KEY]);
  let qi = 0;
  while (qi < queue.length) {
    const k = queue[qi++];
    const t = g.tiles.get(k);
    for (const [dq, dr] of DIRS) {
      const nk = key(t.q + dq, t.r + dr);
      if (seen.has(nk)) continue;
      const nt = g.tiles.get(nk);
      if (!nt || !nt.building || !BLOCKS[nt.building.type].conducts) continue;
      seen.add(nk);
      nt.building.online = true;
      g.parents.set(nk, k);
      queue.push(nk);
    }
  }
}

// Dijkstra field: enemies descend it. Buildings cost extra so they route
// around defenses but breach when that's genuinely shorter.
function dijkstraField(g, sources) {
  const dist = new Map();
  const frontier = [];
  for (const k of sources) { dist.set(k, 0); frontier.push([k, 0]); }
  while (frontier.length) {
    let mi = 0;
    for (let i = 1; i < frontier.length; i++) if (frontier[i][1] < frontier[mi][1]) mi = i;
    const [k, d] = frontier.splice(mi, 1)[0];
    if (d > dist.get(k)) continue;
    const t = g.tiles.get(k);
    for (const [dq, dr] of DIRS) {
      const nk = key(t.q + dq, t.r + dr);
      const nt = g.tiles.get(nk);
      if (!nt || nt.rock) continue;
      let cost = 1;
      if (nt.building) cost = nt.building.type === "wall" ? 90 : 35;
      const nd = d + cost;
      if (nd < (dist.has(nk) ? dist.get(nk) : Infinity)) {
        dist.set(nk, nd);
        frontier.push([nk, nd]);
      }
    }
  }
  return dist;
}

function rebuildNets(g) {
  computeNetwork(g);
  g.flowCore = dijkstraField(g, [CORE_KEY]);
  // raiders home in on your nearest structure (core included)
  const structKeys = g.buildings.filter(b => b.type !== "wall").map(b => key(b.q, b.r));
  g.flowStruct = dijkstraField(g, structKeys.length ? structKeys : [CORE_KEY]);
}

/* ------------------------------------------------------------ buildings */
function placeBuilding(g, type, q, r, free) {
  const t = g.tiles.get(key(q, r));
  const def = BLOCKS[type];
  const b = {
    type, q, r,
    x: hexX(q, r), y: hexY(q, r),
    hp: def.hp, maxHp: def.hp,
    online: false, mineT: 0,
    cool: 0, angle: Math.random() * TAU, muzzle: 0, dry: 0, flash: 0,
  };
  t.building = b;
  g.buildings.push(b);
  if (!free) for (const res in def.cost) g.res[res] -= def.cost[res];
  rebuildNets(g);
  return b;
}

function destroyBuilding(g, b, refund) {
  const t = g.tiles.get(key(b.q, b.r));
  if (t && t.building === b) t.building = null;
  const i = g.buildings.indexOf(b);
  if (i >= 0) g.buildings.splice(i, 1);
  if (refund) {
    const def = BLOCKS[b.type];
    for (const res in def.cost) g.res[res] += Math.floor(def.cost[res] * 0.6);
  } else {
    burst(g, b.x, b.y, "#f0a050", 14, 90);
  }
  if (b.type === "core") { gameOver(g); return; }
  rebuildNets(g);
}

function canPlace(g, type, q, r) {
  if (!g.level.blocks.includes(type)) return false;
  const t = g.tiles.get(key(q, r));
  if (!t || t.rock || t.building) return false;
  const def = BLOCKS[type];
  if (def.needsOre && !t.ore) return false;
  for (const res in def.cost) if (g.res[res] < def.cost[res]) return false;
  return true;
}

function damageBuilding(g, b, dmg) {
  b.hp -= dmg;
  b.flash = 0.12;
  if (b.hp <= 0) destroyBuilding(g, b, false);
}

// would this tile connect to the online network?
function wouldBeOnline(g, q, r) {
  for (const [dq, dr] of DIRS) {
    const nt = g.tiles.get(key(q + dq, r + dr));
    if (nt && nt.building && nt.building.online && BLOCKS[nt.building.type].conducts) return true;
  }
  return false;
}

/* --------------------------------------------------- production/pulses */
function updateDrill(g, b, dt) {
  if (!b.online) return;
  const t = g.tiles.get(key(b.q, b.r));
  if (!t.ore) return;
  b.mineT += dt;
  if (b.mineT >= DRILL_TIMES[t.ore]) {
    b.mineT = 0;
    const next = g.parents.get(key(b.q, b.r));
    if (next) g.pulses.push({ node: key(b.q, b.r), next, t: 0, res: t.ore });
  }
}

function nodeAlive(g, k) {
  if (k === CORE_KEY) return true;
  const t = g.tiles.get(k);
  return !!(t && t.building && BLOCKS[t.building.type].conducts && t.building.online);
}

function updatePulses(g, dt) {
  for (let i = g.pulses.length - 1; i >= 0; i--) {
    const p = g.pulses[i];
    // network changed under us? drop the cargo, visibly
    if (!nodeAlive(g, p.node) || !nodeAlive(g, p.next)) {
      const pos = pulsePos(g, p);
      burst(g, pos.x, pos.y, "#777788", 4, 50);
      g.lost++;
      g.pulses.splice(i, 1);
      continue;
    }
    p.t += dt * PULSE_SPEED;
    while (p.t >= 1) {
      p.t -= 1;
      p.node = p.next;
      if (p.node === CORE_KEY) {
        g.res[p.res] += 1;
        burst(g, 0, 0, RES_COLORS[p.res], 2, 40);
        g.pulses.splice(i, 1);
        break;
      }
      p.next = g.parents.get(p.node);
      if (!p.next) { g.pulses.splice(i, 1); g.lost++; break; }
    }
  }
}
function pulsePos(g, p) {
  const [aq, ar] = p.node.split(",").map(Number);
  const [bq, br] = p.next.split(",").map(Number);
  return {
    x: lerp(hexX(aq, ar), hexX(bq, br), p.t),
    y: lerp(hexY(aq, ar), hexY(bq, br), p.t),
  };
}

/* -------------------------------------------------------------- turrets */
function updateTurret(g, b, dt) {
  const def = BLOCKS[b.type].turret;
  b.cool -= dt;
  b.dry = Math.max(0, b.dry - dt);
  let best = null, bestD = def.range * def.range;
  for (const e of g.enemies) {
    const d = dist2(e.x, e.y, b.x, b.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) return;
  b.angle = Math.atan2(best.y - b.y, best.x - b.x);
  if (b.cool > 0) return;
  if (!b.online) { b.dry = 0.4; return; }
  if (g.res[def.ammo] < def.ammoCost) { b.dry = 0.4; return; }
  g.res[def.ammo] -= def.ammoCost;
  b.cool = def.reload;
  b.muzzle = 0.06;
  g.projectiles.push({
    x: b.x + Math.cos(b.angle) * HEX * 0.6,
    y: b.y + Math.sin(b.angle) * HEX * 0.6,
    vx: Math.cos(b.angle) * def.pspeed,
    vy: Math.sin(b.angle) * def.pspeed,
    dmg: def.dmg, aoe: def.aoe, life: def.range / def.pspeed + 0.12,
    heavy: b.type === "lance",
  });
}

/* -------------------------------------------------------------- enemies */
const ENEMY_KINDS = {
  grunt:  { label: "grunt",  color: "#b04048", eye: "#f0d0d0" },
  raider: { label: "raider", color: "#c26a35", eye: "#ffe8c0" },
  brute:  { label: "brute",  color: "#8f3038", eye: "#f0d0d0" },
};

function spawnEnemy(g, sp, kind) {
  const n = g.wave;
  const hp = (28 * Math.pow(1.13, n) + 5 * n) * g.level.hpMul;
  const jitter = () => (Math.random() - 0.5) * HEX;
  const base = {
    x: hexX(sp.q, sp.r) + jitter(), y: hexY(sp.q, sp.r) + jitter(),
    kind, atk: 0, angle: 0, age: 0,
  };
  if (kind === "brute") Object.assign(base, {
    hp: hp * 4, maxHp: hp * 4, speed: 22, dmg: 24, atkTime: 0.9, size: HEX * 0.62, bounty: 12,
  });
  else if (kind === "raider") Object.assign(base, {
    hp: hp * 0.6, maxHp: hp * 0.6, speed: 46, dmg: 14, atkTime: 0.55, size: HEX * 0.34, bounty: 5,
  });
  else Object.assign(base, {
    hp, maxHp: hp, speed: 32 + Math.min(n * 0.8, 14), dmg: 8, atkTime: 0.7, size: HEX * 0.38, bounty: 2,
  });
  g.enemies.push(base);
}

function updateEnemy(g, e, dt) {
  e.atk -= dt;
  e.age += dt;
  // raiders that have harassed the periphery too long lose patience and
  // charge the core — no wave can be stalled forever by rebuilding bait
  const enraged = e.kind === "raider" && e.age > 75;
  const field = e.kind === "raider" && !enraged ? g.flowStruct : g.flowCore;
  const h = pixelToHex(e.x, e.y);
  const myKey = key(h.q, h.r);
  let bestK = null, bestD = field.has(myKey) ? field.get(myKey) : Infinity;
  for (const [dq, dr] of DIRS) {
    const nk = key(h.q + dq, h.r + dr);
    if (!field.has(nk)) continue;
    if (field.get(nk) < bestD) { bestD = field.get(nk); bestK = nk; }
  }
  const bestT = bestK ? g.tiles.get(bestK) : null;

  let target = null;
  if (bestT && bestT.building) target = bestT.building;
  const myTile = g.tiles.get(myKey);
  if (myTile && myTile.building && myTile.building.type !== "core") target = myTile.building;
  // raider standing on its prize (dist 0 tile) attacks it
  if (!target && e.kind === "raider" && myTile && myTile.building) target = myTile.building;

  if (target) {
    const d = Math.hypot(target.x - e.x, target.y - e.y);
    e.angle = Math.atan2(target.y - e.y, target.x - e.x);
    if (d > NEIGHBOR_DIST * 0.72) {
      e.x += Math.cos(e.angle) * e.speed * dt;
      e.y += Math.sin(e.angle) * e.speed * dt;
    } else if (e.atk <= 0) {
      e.atk = e.atkTime;
      burst(g, target.x, target.y, "#e06060", 3, 60);
      damageBuilding(g, target, e.dmg);
      if (game.over) return;
    }
  } else if (bestT) {
    const tx = hexX(bestT.q, bestT.r), ty = hexY(bestT.q, bestT.r);
    e.angle = Math.atan2(ty - e.y, tx - e.x);
    e.x += Math.cos(e.angle) * e.speed * dt;
    e.y += Math.sin(e.angle) * e.speed * dt;
  }
  // separation
  for (const o of g.enemies) {
    if (o === e) continue;
    const dx = e.x - o.x, dy = e.y - o.y;
    const d2 = dx * dx + dy * dy, min = (e.size + o.size) * 0.8;
    if (d2 > 0.01 && d2 < min * min) {
      const d = Math.sqrt(d2);
      e.x += dx / d * (min - d) * 0.35;
      e.y += dy / d * (min - d) * 0.35;
    }
  }
}

/* ---------------------------------------------------------------- waves */
function waveComp(g, n) {
  const nsp = Math.max(g.spawnPoints.length, 1);
  const allIdxs = g.spawnPoints.map((_, i) => i);
  if (n <= g.waveTable.length) {
    const w = g.waveTable[n - 1];
    return {
      n, grunts: w.grunts, raiders: w.raiders, brutes: w.brutes,
      spawnIdxs: w.spawn === "all" ? allIdxs : [w.spawn % nsp],
      final: n === g.waveTable.length && !g.endless,
    };
  }
  // endless: past the table, fall back to the scaling formula
  const grunts = Math.min(4 + Math.round(n * 1.5), 28);
  const raiders = n >= 5 ? Math.floor((n - 2) / 3) : 0;
  const brutes = n % 4 === 0 ? Math.floor(n / 4) : 0;
  const spawnIdxs = n % 5 === 0 ? allIdxs : [(n - 1) % nsp];
  return { n, grunts, raiders, brutes, spawnIdxs, final: false };
}

function compText(c) {
  const parts = [];
  if (c.grunts) parts.push(c.grunts + " grunt" + (c.grunts > 1 ? "s" : ""));
  if (c.brutes) parts.push(c.brutes + " brute" + (c.brutes > 1 ? "s" : ""));
  if (c.raiders) parts.push(c.raiders + " raider" + (c.raiders > 1 ? "s" : "") + " ⚠");
  return parts.join(", ");
}

function compass(x, y) {
  const names = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
  const idx = ((Math.round(Math.atan2(y, x) / (TAU / 8)) % 8) + 8) % 8;
  return names[idx];
}

function startWave(g) {
  const c = g.nextWave || waveComp(g, g.wave + 1);
  g.wave = c.n;
  const sps = c.spawnIdxs.map(i => g.spawnPoints[i]);
  const push = (kind, count, delay0, gap) => {
    for (let i = 0; i < count; i++)
      g.pendingSpawns.push({ at: g.time + delay0 + i * gap, sp: sps[i % sps.length], kind });
  };
  push("grunt", c.grunts, 0, 0.65);
  push("raider", c.raiders, 1.2, 1.1);
  push("brute", c.brutes, 2.5, 1.5);
  g.waveTimer = c.final ? 9999 : Math.max(28, 46 - c.n * 1.2);
  g.nextWave = (c.n >= g.finalWave && !g.endless) ? null : waveComp(g, c.n + 1);
  // the all-fronts finale is telegraphed a wave ahead — grant time to redeploy
  if (g.nextWave && g.nextWave.final) g.waveTimer += 35;
  showMsg(c.final ? "FINAL WAVE — they come from every front!" : "Wave " + c.n + " incoming!");
}

function callWave(g) {
  if (g.over || g.won || !g.nextWave) return;
  if (g.enemies.length || g.pendingSpawns.length) return;
  const bonus = Math.floor(g.waveTimer * 0.8);
  g.res.copper += bonus;
  if (bonus > 0) showMsg("+" + bonus + " copper for calling it early");
  g.waveTimer = 0.01;
}

/* -------------------------------------------------------------- effects */
function burst(g, x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.6);
    g.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.25 + Math.random() * 0.3, max: 0.55, color,
      size: 1.5 + Math.random() * 2.5,
    });
  }
}

/* ------------------------------------------------------------ main tick */
function tick(g, dt) {
  if (g.over || g.paused) return;
  g.time += dt;

  const waveActive = g.enemies.length > 0 || g.pendingSpawns.length > 0;

  // waves
  if (g.nextWave) {
    g.waveTimer -= dt;
    if (g.waveTimer <= 0) startWave(g);
  }
  for (let i = g.pendingSpawns.length - 1; i >= 0; i--) {
    if (g.time >= g.pendingSpawns[i].at) {
      const s = g.pendingSpawns.splice(i, 1)[0];
      spawnEnemy(g, s.sp, s.kind);
    }
  }

  // buildings
  for (const b of g.buildings) {
    b.flash = Math.max(0, b.flash - dt);
    if (b.muzzle) b.muzzle = Math.max(0, b.muzzle - dt);
    if (b.type === "drill") updateDrill(g, b, dt);
    else if (BLOCKS[b.type].turret) updateTurret(g, b, dt);
    // quiet self-repair between waves
    if (!waveActive && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + 9 * dt);
  }

  updatePulses(g, dt);

  // projectiles
  for (let i = g.projectiles.length - 1; i >= 0; i--) {
    const p = g.projectiles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    let hit = false;
    for (const e of g.enemies) {
      if (dist2(p.x, p.y, e.x, e.y) < (e.size + 3) * (e.size + 3)) {
        e.hp -= p.dmg;
        if (p.aoe) {
          for (const o of g.enemies)
            if (o !== e && dist2(p.x, p.y, o.x, o.y) < p.aoe * p.aoe) o.hp -= p.dmg * 0.6;
        }
        burst(g, p.x, p.y, p.heavy ? "#9db8f0" : "#f0d060", p.heavy ? 7 : 3, 70);
        hit = true;
        break;
      }
    }
    if (hit || p.life <= 0) g.projectiles.splice(i, 1);
  }

  // enemies
  for (let i = g.enemies.length - 1; i >= 0; i--) {
    const e = g.enemies[i];
    if (e.hp <= 0) {
      g.enemies.splice(i, 1);
      g.res.copper += e.bounty;
      g.kills++;
      burst(g, e.x, e.y, "#e06060", 10, 90);
      continue;
    }
    updateEnemy(g, e, dt);
    if (g.over) return;
  }

  // victory: final wave cleared
  if (!g.won && !g.endless && g.wave >= g.finalWave &&
      g.enemies.length === 0 && g.pendingSpawns.length === 0) {
    victory(g);
  }

  // particles
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const p = g.particles[i];
    p.life -= dt;
    if (p.life <= 0) { g.particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
  }
}

function statsText(g) {
  const mins = Math.floor(g.time / 60), secs = Math.floor(g.time % 60);
  return `${g.kills} kills · ${mins}m ${String(secs).padStart(2, "0")}s · ${g.lost} pulses lost to cut arteries`;
}

function setOverlayButtons(v) {
  for (const id of ["continue-btn", "next-btn", "restart-btn", "menu-btn"])
    document.getElementById(id).classList.toggle("hidden", !v[id]);
}

function gameOver(g) {
  if (g.over) return;
  g.over = true;
  const t = document.getElementById("overlay-title");
  t.textContent = "Core destroyed";
  t.className = "lost";
  document.getElementById("overlay-text").textContent =
    "Your foundry fell on wave " + Math.max(g.wave, 1) + ".\n" + statsText(g);
  document.getElementById("restart-btn").textContent =
    g.levelIndex >= 0 ? "Retry level" : "New map";
  setOverlayButtons({ "restart-btn": true, "menu-btn": true });
  document.getElementById("overlay").classList.remove("hidden");
}

function victory(g) {
  g.won = true;
  markDone(g.levelIndex);
  const t = document.getElementById("overlay-title");
  t.textContent = g.levelIndex >= 0 ? g.level.name + " holds" : "The foundry holds";
  t.className = "won";
  document.getElementById("overlay-text").textContent =
    "You survived all " + g.finalWave + " waves.\n" + statsText(g);
  const hasNext = g.levelIndex >= 0 && g.levelIndex + 1 < LEVELS.length;
  document.getElementById("restart-btn").textContent =
    g.levelIndex >= 0 ? "Retry level" : "New map";
  setOverlayButtons({
    "next-btn": hasNext, "continue-btn": true,
    "restart-btn": !hasNext, "menu-btn": true,
  });
  document.getElementById("overlay").classList.remove("hidden");
}

/* ============================== RENDERING ============================== */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;
const cam = { x: 0, y: 0, zoom: 1 };

function resize() {
  DPR = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
}
window.addEventListener("resize", resize);
resize();

function fitCamera() {
  const span = (game.mapR * 2 + 2) * NEIGHBOR_DIST;
  cam.zoom = Math.min(W, H) / span * 1.08;
  cam.x = 0; cam.y = 0;
}

const FLOOR_COLORS = { stone: "#43434d", sand: "#6b5f4a", grass: "#4c5e45" };

function screenToWorld(sx, sy) {
  return { x: (sx - W / 2) / cam.zoom + cam.x, y: (sy - H / 2) / cam.zoom + cam.y };
}
function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) + amt * 255, g2 = ((n >> 8) & 255) + amt * 255, b = (n & 255) + amt * 255;
  return `rgb(${clamp(r | 0, 0, 255)},${clamp(g2 | 0, 0, 255)},${clamp(b | 0, 0, 255)})`;
}
function centerOf(k) {
  const [q, r] = k.split(",").map(Number);
  return { x: hexX(q, r), y: hexY(q, r) };
}

/* static terrain pre-rendered once per map — phones can't afford 600+
   hex fills per frame */
let terrain = null;
function buildTerrainCache(g) {
  const S = 2; // cache pixels per world unit
  const span = (g.mapR + 1.5) * NEIGHBOR_DIST;
  const tc = document.createElement("canvas");
  tc.width = Math.ceil(span * 2 * S);
  tc.height = Math.ceil(span * 2 * S);
  const c = tc.getContext("2d");
  c.setTransform(S, 0, 0, S, span * S, span * S);
  for (const t of g.tiles.values()) {
    const x = hexX(t.q, t.r), y = hexY(t.q, t.r);
    hexPath(c, x, y, 1.02);
    if (t.rock) {
      // rock must read as terrain, not as dark floor: lighter ridged cap
      c.fillStyle = shadeColor("#23232a", t.shade);
      c.fill();
      hexPath(c, x, y, 0.78);
      c.fillStyle = shadeColor("#5b5b66", t.shade);
      c.fill();
      hexPath(c, x, y, 0.45);
      c.fillStyle = shadeColor("#73737f", t.shade);
      c.fill();
      hexPath(c, x, y, 0.95);
      c.strokeStyle = "#191920";
      c.lineWidth = 1.5;
      c.stroke();
    } else {
      c.fillStyle = shadeColor(FLOOR_COLORS[t.floor], t.shade);
      c.fill();
      if (t.ore) {
        c.fillStyle = RES_COLORS[t.ore];
        for (let i = 0; i < 3; i++) {
          const a = TAU * i / 3 + t.shade * 40;
          c.beginPath();
          c.arc(x + Math.cos(a) * HEX * 0.38, y + Math.sin(a) * HEX * 0.38, HEX * 0.14, 0, TAU);
          c.fill();
        }
      }
    }
  }
  c.strokeStyle = "#00000030";
  c.lineWidth = 1;
  for (const t of g.tiles.values()) {
    if (t.rock) continue;
    hexPath(c, hexX(t.q, t.r), hexY(t.q, t.r));
    c.stroke();
  }
  terrain = { canvas: tc, span, seed: g.seed };
}

function draw(g) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#17171c";
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(cam.zoom * DPR, 0, 0, cam.zoom * DPR,
    (W / 2 - cam.x * cam.zoom) * DPR, (H / 2 - cam.y * cam.zoom) * DPR);

  /* terrain (cached) */
  if (!terrain || terrain.seed !== g.seed) buildTerrainCache(g);
  ctx.drawImage(terrain.canvas, -terrain.span, -terrain.span, terrain.span * 2, terrain.span * 2);

  /* spawn markers — upcoming wave's fronts glow orange */
  const pulse = 0.75 + 0.25 * Math.sin(g.time * 4);
  const upcoming = new Set((g.nextWave ? g.nextWave.spawnIdxs : []));
  g.spawnPoints.forEach((sp, i) => {
    hexPath(ctx, hexX(sp.q, sp.r), hexY(sp.q, sp.r), 0.85);
    if (upcoming.has(i)) {
      ctx.strokeStyle = `rgba(240,160,60,${pulse})`;
      ctx.lineWidth = 3.5;
    } else {
      ctx.strokeStyle = `rgba(224,96,96,${0.35 + 0.15 * pulse})`;
      ctx.lineWidth = 2;
    }
    ctx.stroke();
  });

  /* network edges */
  ctx.lineWidth = 2;
  for (const [k, pk] of g.parents) {
    const a = centerOf(k), b = centerOf(pk);
    ctx.strokeStyle = "#6fb8a840";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  /* buildings */
  for (const b of g.buildings) drawBuilding(ctx, b, g.time);

  /* resource pulses */
  for (const p of g.pulses) {
    const pos = pulsePos(g, p);
    ctx.fillStyle = RES_COLORS[p.res];
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#ffffff50";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* enemies */
  for (const e of g.enemies) {
    const k = ENEMY_KINDS[e.kind];
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    ctx.fillStyle = k.color;
    ctx.beginPath();
    if (e.kind === "raider") {
      // slim fast dart
      ctx.moveTo(e.size * 1.3, 0);
      ctx.lineTo(-e.size * 0.8, e.size * 0.55);
      ctx.lineTo(-e.size * 0.4, 0);
      ctx.lineTo(-e.size * 0.8, -e.size * 0.55);
    } else {
      ctx.moveTo(e.size, 0);
      ctx.lineTo(-e.size * 0.7, e.size * 0.75);
      ctx.lineTo(-e.size * 0.35, 0);
      ctx.lineTo(-e.size * 0.7, -e.size * 0.75);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = k.eye;
    ctx.beginPath();
    ctx.arc(e.size * 0.25, 0, e.size * 0.22, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (e.hp < e.maxHp) {
      const w = e.size * 2;
      ctx.fillStyle = "#000000aa";
      ctx.fillRect(e.x - w / 2, e.y - e.size - 7, w, 3);
      ctx.fillStyle = "#e06060";
      ctx.fillRect(e.x - w / 2, e.y - e.size - 7, w * clamp(e.hp / e.maxHp, 0, 1), 3);
    }
  }

  /* projectiles */
  for (const p of g.projectiles) {
    const l = p.heavy ? 10 : 6;
    const d = Math.hypot(p.vx, p.vy);
    ctx.strokeStyle = p.heavy ? "#9db8f0" : "#f0d060";
    ctx.lineWidth = p.heavy ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx / d * l, p.y - p.vy / d * l);
    ctx.stroke();
  }

  /* particles */
  for (const p of g.particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* build ghost */
  if (ui.tool === "demolish" && ui.hover && !g.over) {
    const t = g.tiles.get(key(ui.hover.q, ui.hover.r));
    if (t) {
      const x = hexX(t.q, t.r), y = hexY(t.q, t.r);
      hexPath(ctx, x, y);
      ctx.strokeStyle = t.building && t.building.type !== "core" ? "#e06060" : "#e0606050";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  } else if (ui.tool && ui.hover && !g.over) {
    const { q, r } = ui.hover;
    const t = g.tiles.get(key(q, r));
    if (t) {
      const ok = canPlace(g, ui.tool, q, r);
      const x = hexX(q, r), y = hexY(q, r);
      const def = BLOCKS[ui.tool];
      if (def.turret) {
        ctx.beginPath();
        ctx.arc(x, y, def.turret.range, 0, TAU);
        ctx.strokeStyle = "#e8b34c50";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // preview the connections this conductor would make
      if (def.conducts) {
        for (const [dq, dr] of DIRS) {
          const nt = g.tiles.get(key(q + dq, r + dr));
          if (nt && nt.building && nt.building.online && BLOCKS[nt.building.type].conducts) {
            ctx.strokeStyle = "#70e080a0";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(hexX(q + dq, r + dr), hexY(q + dq, r + dr));
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 0.55;
      drawBuilding(ctx, { type: ui.tool, x, y, hp: 1, maxHp: 1, flash: 0, angle: -0.5, mineT: 0, online: true }, g.time);
      ctx.globalAlpha = 1;
      hexPath(ctx, x, y);
      const offline = ok && def.conducts && !wouldBeOnline(g, q, r);
      ctx.strokeStyle = !ok ? "#e06060" : offline ? "#e0b060" : "#70e080";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (offline) {
        ctx.fillStyle = "#e0b060";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("offline", x, y - HEX - 6);
      }
    }
  } else if (ui.hover && !g.over) {
    const t = g.tiles.get(key(ui.hover.q, ui.hover.r));
    if (t && !t.rock) {
      hexPath(ctx, hexX(t.q, t.r), hexY(t.q, t.r));
      ctx.strokeStyle = "#ffffff40";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

function drawBuilding(c, b, time) {
  const x = b.x, y = b.y;
  switch (b.type) {
    case "core": {
      hexPath(c, x, y, 1.12);
      c.fillStyle = "#8a6d35";
      c.fill();
      hexPath(c, x, y, 0.88);
      c.fillStyle = "#e8b34c";
      c.fill();
      hexPath(c, x, y, 0.5);
      c.fillStyle = "#f5d06e";
      c.fill();
      c.fillStyle = "#8a6d35";
      c.beginPath();
      c.arc(x, y, HEX * 0.2, 0, TAU);
      c.fill();
      break;
    }
    case "link": {
      hexPath(c, x, y, 0.55);
      c.fillStyle = "#2f4a45";
      c.fill();
      c.strokeStyle = "#6fb8a8";
      c.lineWidth = 1.5;
      hexPath(c, x, y, 0.55);
      c.stroke();
      c.fillStyle = b.online ? "#8fe0cc" : "#556";
      c.beginPath();
      c.arc(x, y, HEX * 0.16, 0, TAU);
      c.fill();
      break;
    }
    case "drill": {
      hexPath(c, x, y, 0.96);
      c.fillStyle = "#4a4438";
      c.fill();
      c.save();
      c.translate(x, y);
      c.rotate(b.online ? time * 2.2 : 0.4);
      c.fillStyle = "#7a705c";
      for (let i = 0; i < 3; i++) {
        c.rotate(TAU / 3);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(HEX * 0.62, -HEX * 0.2);
        c.lineTo(HEX * 0.62, HEX * 0.2);
        c.closePath();
        c.fill();
      }
      c.restore();
      c.fillStyle = "#2c2c33";
      c.beginPath();
      c.arc(x, y, HEX * 0.22, 0, TAU);
      c.fill();
      break;
    }
    case "sting":
    case "lance": {
      const heavy = b.type === "lance";
      hexPath(c, x, y, 0.96);
      c.fillStyle = heavy ? "#3a4252" : "#45454e";
      c.fill();
      c.save();
      c.translate(x, y);
      c.rotate(b.angle || 0);
      c.fillStyle = heavy ? "#8da7c6" : "#9a9aa8";
      c.fillRect(0, heavy ? -4 : -3, HEX * (heavy ? 1.0 : 0.8), heavy ? 8 : 6);
      c.beginPath();
      c.arc(0, 0, HEX * (heavy ? 0.42 : 0.36), 0, TAU);
      c.fill();
      c.fillStyle = heavy ? "#5a7396" : "#6a6a78";
      c.beginPath();
      c.arc(0, 0, HEX * 0.2, 0, TAU);
      c.fill();
      if (b.muzzle) {
        c.fillStyle = "#fff0a0";
        c.beginPath();
        c.arc(HEX * (heavy ? 1.0 : 0.8), 0, 5, 0, TAU);
        c.fill();
      }
      c.restore();
      // dry-fire warning
      if (b.dry > 0 && Math.floor(time * 6) % 2 === 0) {
        c.strokeStyle = "#e06060";
        c.lineWidth = 2;
        hexPath(c, x, y, 0.96);
        c.stroke();
      }
      break;
    }
    case "wall": {
      hexPath(c, x, y, 0.96);
      c.fillStyle = "#767683";
      c.fill();
      hexPath(c, x, y, 0.62);
      c.fillStyle = "#8f8f9c";
      c.fill();
      break;
    }
  }
  // offline conductors dim out and complain loudly
  if (b.online === false && BLOCKS[b.type].conducts && b.type !== "core") {
    hexPath(c, x, y, 0.96);
    c.fillStyle = "#17171c99";
    c.fill();
    if (Math.floor(time * 2) % 2 === 0) {
      c.fillStyle = "#e0b060";
      c.font = "bold 14px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("!", x, y);
    }
  }
  if (b.flash > 0) {
    hexPath(c, x, y, 0.96);
    c.fillStyle = `rgba(255,120,120,${b.flash * 4})`;
    c.fill();
  }
  if (b.hp < b.maxHp && b.type !== "core") {
    const w = HEX * 1.3;
    c.fillStyle = "#000000aa";
    c.fillRect(x - w / 2, y - HEX - 4, w, 3);
    c.fillStyle = "#70e080";
    c.fillRect(x - w / 2, y - HEX - 4, w * clamp(b.hp / b.maxHp, 0, 1), 3);
  }
}

/* ================================ UI/INPUT ============================= */
const ui = {
  tool: null, hover: null,
  lastPaint: null,
  keys: {},
};

const DEMOLISH_DEF = {
  name: "Demolish", key: "X", cost: {},
  desc: "Remove a building for a 60% refund. On desktop, right-drag demolishes directly.",
};
const toolDef = type => type === "demolish" ? DEMOLISH_DEF : BLOCKS[type];

function showMsg(text) {
  const el = document.getElementById("msg");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2600);
}

function buildToolbar() {
  const bar = document.getElementById("toolbar");
  bar.innerHTML = "";
  const avail = TOOL_ORDER.filter(t => game.level.blocks.includes(t));
  for (const type of [...avail, "demolish"]) {
    const def = toolDef(type);
    const el = document.createElement("div");
    el.className = "tool";
    el.dataset.type = type;
    const ic = document.createElement("canvas");
    ic.width = 68; ic.height = 68;
    const icx = ic.getContext("2d");
    icx.translate(34, 34);
    icx.scale(34 / (HEX * 1.25), 34 / (HEX * 1.25));
    if (type === "demolish") {
      hexPath(icx, 0, 0, 0.96);
      icx.fillStyle = "#4a2f2f";
      icx.fill();
      icx.strokeStyle = "#e06060";
      icx.lineWidth = 4;
      icx.beginPath();
      icx.moveTo(-HEX * 0.4, -HEX * 0.4); icx.lineTo(HEX * 0.4, HEX * 0.4);
      icx.moveTo(HEX * 0.4, -HEX * 0.4); icx.lineTo(-HEX * 0.4, HEX * 0.4);
      icx.stroke();
    } else {
      drawBuilding(icx, { type, x: 0, y: 0, hp: 1, maxHp: 1, flash: 0, angle: -0.5, mineT: 0, online: true }, 0.2);
    }
    const name = document.createElement("div");
    name.className = "tname";
    name.textContent = def.name;
    const cost = document.createElement("div");
    cost.className = "tcost";
    el.append(ic, name, cost);
    el.addEventListener("click", () => selectTool(ui.tool === type ? null : type));
    el.addEventListener("mouseenter", () => {
      const tip = document.getElementById("tooltip");
      tip.innerHTML = `<b>${def.name}</b> [${def.key}] — ${Object.entries(def.cost).map(([r, n]) => n + " " + r).join(", ") || "free"}`
        + (def.stat ? `<br><span class="stat">${def.stat}</span>` : "")
        + `<br>${def.desc}`;
      tip.style.display = "block";
      const rect = el.getBoundingClientRect();
      tip.style.left = clamp(rect.left, 8, W - 266) + "px";
      tip.style.bottom = (H - rect.top + 8) + "px";
      tip.style.top = "auto";
    });
    el.addEventListener("mouseleave", () => {
      document.getElementById("tooltip").style.display = "none";
    });
    bar.appendChild(el);
  }
}

function refreshToolbar() {
  for (const el of document.querySelectorAll(".tool")) {
    const type = el.dataset.type;
    const def = toolDef(type);
    el.classList.toggle("selected", ui.tool === type);
    if (type === "demolish") {
      el.querySelector(".tcost").textContent = "60% back";
      continue;
    }
    const parts = Object.entries(def.cost).map(([r, n]) =>
      `<span class="${game.res[r] >= n ? "" : "no"}">${n} ${r === "titanium" ? "titan" : r}</span>`);
    el.querySelector(".tcost").innerHTML = parts.join(" ") || "free";
  }
}

function selectTool(type) {
  ui.tool = type;
  refreshToolbar();
}

function incomeRate(g, res) {
  let rate = 0;
  for (const b of g.buildings) {
    if (b.type !== "drill" || !b.online) continue;
    const t = g.tiles.get(key(b.q, b.r));
    if (t.ore === res) rate += 1 / DRILL_TIMES[res];
  }
  return rate;
}

function refreshHud(g) {
  document.getElementById("res-copper").textContent = Math.floor(g.res.copper);
  document.getElementById("res-titanium").textContent = Math.floor(g.res.titanium);
  const rc = incomeRate(g, "copper"), rt = incomeRate(g, "titanium");
  document.getElementById("rate-copper").textContent = rc > 0 ? "+" + rc.toFixed(1) + "/s" : "";
  document.getElementById("rate-titanium").textContent = rt > 0 ? "+" + rt.toFixed(1) + "/s" : "";
  document.getElementById("wave-num").textContent = g.wave;
  document.getElementById("wave-final").textContent = g.endless ? "∞" : g.finalWave;

  const pv = document.getElementById("wave-preview");
  const btn = document.getElementById("call-wave");
  const active = g.enemies.length || g.pendingSpawns.length;
  if (active) {
    pv.textContent = g.enemies.length + " enemies on the field";
    btn.disabled = true;
  } else if (g.nextWave) {
    const c = g.nextWave;
    const dirs = c.spawnIdxs.map(i => {
      const sp = g.spawnPoints[i];
      return compass(hexX(sp.q, sp.r), hexY(sp.q, sp.r));
    }).join("+");
    pv.textContent = (c.final ? "FINAL: " : "in " + Math.ceil(g.waveTimer) + "s: ") +
      compText(c) + " from " + (c.final ? "ALL SIDES" : dirs);
    btn.disabled = false;
  } else {
    pv.textContent = "all waves cleared";
    btn.disabled = true;
  }
  document.getElementById("core-hp").style.width =
    (g.core ? clamp(g.core.hp / g.core.maxHp, 0, 1) * 100 : 0) + "%";
}

/* placement */
function tryBuild(g, q, r) {
  if (!ui.tool || ui.tool === "demolish" || !canPlace(g, ui.tool, q, r)) return false;
  placeBuilding(g, ui.tool, q, r, false);
  refreshToolbar();
  return true;
}
function tryDemolish(g, q, r) {
  const t = g.tiles.get(key(q, r));
  if (t && t.building && t.building.type !== "core") {
    destroyBuilding(g, t.building, true);
    return true;
  }
  return false;
}

/* pointer input — unified mouse + touch.
   One finger / left-drag: paint with a tool selected, pan without one.
   Two fingers: pinch zoom + pan. Right-drag or Demolish tool: erase. */
const pointers = new Map();   // pointerId -> {x, y}
let pinch = null;             // {d0, zoom0, w0} while two fingers are down
let pmode = null;             // 'pan' | 'paint' | 'erase'

function pinchState() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}

canvas.addEventListener("pointerdown", ev => {
  ev.preventDefault();
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic events */ }
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (game.over) return;
  if (pointers.size === 2) {
    pmode = null;
    ui.lastPaint = null;
    const s = pinchState();
    pinch = { d0: s.d, zoom0: cam.zoom, w0: screenToWorld(s.mx, s.my) };
    return;
  }
  if (pointers.size > 2) return;
  const w = screenToWorld(ev.clientX, ev.clientY);
  const h = pixelToHex(w.x, w.y);
  ui.hover = h;
  if (ev.button === 1 || ui.keys[" "]) {
    pmode = "pan";
  } else if (ev.button === 2 || ui.tool === "demolish") {
    pmode = "erase";
    tryDemolish(game, h.q, h.r);
  } else if (ui.tool) {
    pmode = "paint";
    ui.lastPaint = h;
    tryBuild(game, h.q, h.r);
  } else {
    pmode = "pan";
  }
});

canvas.addEventListener("pointermove", ev => {
  const prev = pointers.get(ev.pointerId);
  if (!prev) {
    // no button down: pure mouse hover
    const w = screenToWorld(ev.clientX, ev.clientY);
    ui.hover = pixelToHex(w.x, w.y);
    return;
  }
  const cur = { x: ev.clientX, y: ev.clientY };
  pointers.set(ev.pointerId, cur);
  if (pinch && pointers.size >= 2) {
    const s = pinchState();
    cam.zoom = clamp(pinch.zoom0 * s.d / Math.max(pinch.d0, 1), 0.35, 3.5);
    cam.x = pinch.w0.x - (s.mx - W / 2) / cam.zoom;
    cam.y = pinch.w0.y - (s.my - H / 2) / cam.zoom;
    return;
  }
  if (pmode === "pan") {
    cam.x -= (cur.x - prev.x) / cam.zoom;
    cam.y -= (cur.y - prev.y) / cam.zoom;
    return;
  }
  const w = screenToWorld(cur.x, cur.y);
  const h = pixelToHex(w.x, w.y);
  ui.hover = h;
  if (pmode === "paint" && ui.tool && ui.tool !== "demolish") {
    if (!ui.lastPaint || ui.lastPaint.q !== h.q || ui.lastPaint.r !== h.r) {
      ui.lastPaint = h;
      tryBuild(game, h.q, h.r);
    }
  } else if (pmode === "erase") {
    tryDemolish(game, h.q, h.r);
  }
});

function endPointer(ev) {
  pointers.delete(ev.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) { pmode = null; ui.lastPaint = null; }
  if (ev.pointerType === "touch") ui.hover = null; // no lingering ghost after a tap
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("contextmenu", ev => ev.preventDefault());
document.addEventListener("gesturestart", ev => ev.preventDefault()); // iOS page zoom
canvas.addEventListener("wheel", ev => {
  ev.preventDefault();
  const before = screenToWorld(ev.clientX, ev.clientY);
  cam.zoom = clamp(cam.zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), 0.35, 3.5);
  const after = screenToWorld(ev.clientX, ev.clientY);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
}, { passive: false });

/* keyboard */
window.addEventListener("keydown", ev => {
  ui.keys[ev.key] = true;
  const k = ev.key.toLowerCase();
  if (k === "escape") {
    if (!document.getElementById("menu").classList.contains("hidden")) {
      if (game && !game.over && !game.backdrop) hideMenu(true);
    } else selectTool(null);
  } else if (k === "x") {
    selectTool(ui.tool === "demolish" ? null : "demolish");
  } else if (k === "p") {
    game.paused = !game.paused;
    showMsg(game.paused ? "Paused" : "Resumed");
  } else {
    for (const type of TOOL_ORDER) {
      if (BLOCKS[type].key === ev.key) selectTool(ui.tool === type ? null : type);
    }
  }
});
window.addEventListener("keyup", ev => { ui.keys[ev.key] = false; });

document.getElementById("call-wave").addEventListener("click", () => callWave(game));

/* ------------------------------------------------ campaign progress */
function loadProgress() {
  try { return JSON.parse(localStorage.getItem("hexfoundry") || "{}"); }
  catch (e) { return {}; }
}
function saveProgress(p) {
  try { localStorage.setItem("hexfoundry", JSON.stringify(p)); } catch (e) { /* private mode */ }
}
function levelDone(i) { return !!((loadProgress().done || [])[i]); }
function markDone(i) {
  if (i < 0) return;
  const p = loadProgress();
  p.done = p.done || [];
  p.done[i] = true;
  saveProgress(p);
}
function levelUnlocked(i) { return i === 0 || levelDone(i - 1); }

/* --------------------------------------------------------- level menu */
function showMenu() {
  if (game) game.paused = true;
  const list = document.getElementById("level-list");
  list.innerHTML = "";
  const mkCard = (lv, i) => {
    const unlocked = i < 0 || levelUnlocked(i);
    const el = document.createElement("div");
    el.className = "level" + (unlocked ? "" : " locked");
    const num = i < 0 ? "∞" : levelDone(i) ? "✓" : String(i + 1);
    const waves = lv.waves ? lv.waves.length : 15;
    el.innerHTML =
      `<div class="lnum${i >= 0 && levelDone(i) ? " ldone" : ""}">${num}</div>` +
      `<div class="lbody"><div class="lname">${lv.name}</div>` +
      `<div class="ltag">${unlocked ? lv.tagline : "Locked — clear the previous level."}</div></div>` +
      `<div class="lwaves">${waves} waves</div>`;
    if (unlocked) el.addEventListener("click", () => startLevel(lv));
    return el;
  };
  LEVELS.forEach((lv, i) => list.appendChild(mkCard(lv, i)));
  list.appendChild(mkCard(SKIRMISH, -1));
  const resume = document.getElementById("menu-resume");
  resume.classList.toggle("hidden", !(game && !game.over && !game.won && !game.backdrop));
  document.getElementById("menu").classList.remove("hidden");
}
function hideMenu(resume) {
  document.getElementById("menu").classList.add("hidden");
  if (resume && game) game.paused = false;
}
document.getElementById("menu-resume").addEventListener("click", () => hideMenu(true));
document.getElementById("menu-open").addEventListener("click", showMenu);

function startLevel(lv) {
  hideMenu(false);
  document.getElementById("overlay").classList.add("hidden");
  game = newGame(lv);
  fitCamera();
  buildToolbar();
  selectTool(null);
  const label = game.levelIndex >= 0 ? "Level " + (game.levelIndex + 1) + ": " + lv.name : lv.name;
  showMsg(label + " — " + lv.intro);
  if (game.levelIndex === 0 || lv === SKIRMISH) introHints();
}

document.getElementById("restart-btn").addEventListener("click", () => startLevel(game.level));
document.getElementById("next-btn").addEventListener("click", () =>
  startLevel(LEVELS[game.levelIndex + 1]));
document.getElementById("menu-btn").addEventListener("click", () => {
  document.getElementById("overlay").classList.add("hidden");
  showMenu();
});
document.getElementById("continue-btn").addEventListener("click", () => {
  document.getElementById("overlay").classList.add("hidden");
  game.endless = true;
  game.won = false;
  game.nextWave = waveComp(game, game.wave + 1);
  game.waveTimer = 40;
  showMsg("Endless mode — how long can the foundry hold?");
});

function introHints() {
  setTimeout(() => { if (game.time > 1 && game.time < 25 && !game.over) showMsg("Turrets eat copper per shot. Income sustains your guns."); }, 9000);
  setTimeout(() => { if (game.time > 1 && game.time < 35 && !game.over) showMsg("The orange rim hex is where the next wave enters. Get ready."); }, 17000);
}

/* ------------------------------------------------------------ main loop */
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  const panSpeed = 420 / cam.zoom * dt;
  if (ui.keys.w || ui.keys.ArrowUp) cam.y -= panSpeed;
  if (ui.keys.s || ui.keys.ArrowDown) cam.y += panSpeed;
  if (ui.keys.a || ui.keys.ArrowLeft) cam.x -= panSpeed;
  if (ui.keys.d || ui.keys.ArrowRight) cam.x += panSpeed;

  tick(game, dt);
  draw(game);
  refreshHud(game);
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- boot */
game = newGame(SKIRMISH);   // quiet backdrop behind the menu
game.paused = true;
game.backdrop = true;
fitCamera();
buildToolbar();
refreshToolbar();
showMenu();
requestAnimationFrame(frame);

// exposed for debugging / testing
window.GAME = {
  get game() { return game; },
  tick, placeBuilding, destroyBuilding, canPlace, newGame, callWave, rebuildNets, wouldBeOnline, cam,
  LEVELS, SKIRMISH, startLevel,
  setGame(g) { game = g; },
};
