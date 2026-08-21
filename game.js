/* =========================================================================
   HEXFOUNDRY — a tiny Mindustry-like on a hexagonal grid
   Mine ore with drills, haul it to your core on conveyors, and hold off
   ever-growing enemy waves with turrets and walls.
   No dependencies, plain canvas.
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
// deterministic 2d hash noise + 2-octave value noise
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
const HEX = 24;                       // hex circumradius (pointy-top)
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const NEIGHBOR_DIST = SQ3 * HEX;      // distance between adjacent centers

const key = (q, r) => q + "," + r;
const hexX = (q, r) => HEX * (SQ3 * q + SQ3 / 2 * r);
const hexY = (q, r) => HEX * 1.5 * r;
const hexDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

function pixelToHex(x, y) {
  const qf = (SQ3 / 3 * x - y / 3) / HEX;
  const rf = (2 / 3 * y) / HEX;
  // cube rounding
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}
// unit vector pointing from a tile center toward neighbor in direction d
const DIRVEC = DIRS.map(([dq, dr]) => {
  const x = hexX(dq, dr), y = hexY(dq, dr);
  const l = Math.hypot(x, y);
  return { x: x / l, y: y / l };
});
// hexagon outline points (pointy-top)
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

const BLOCKS = {
  core: {
    name: "Core", hp: 1400, cost: {},
    desc: "Your heart. Stores resources. Protect it at all costs.",
    buildable: false,
  },
  conveyor: {
    name: "Conveyor", hp: 60, cost: { copper: 1 },
    desc: "Moves items one hex at a time. Chain them from drills to the core. Auto-rotates while dragging.",
    key: "1",
  },
  drill: {
    name: "Drill", hp: 110, cost: { copper: 12 },
    desc: "Place on an ore vein. Mines it and feeds adjacent conveyors or the core.",
    key: "2", needsOre: true,
  },
  duo: {
    name: "Sting turret", hp: 140, cost: { copper: 30 },
    desc: "Fast light turret. Your bread and butter defense.",
    key: "3", turret: { range: 120, reload: 0.45, dmg: 7, pspeed: 400 },
  },
  lancer: {
    name: "Lance turret", hp: 200, cost: { copper: 60, titanium: 25 },
    desc: "Slow, long-range, heavy hits. Needs titanium to build.",
    key: "4", turret: { range: 190, reload: 1.15, dmg: 27, pspeed: 560 },
  },
  wall: {
    name: "Wall", hp: 340, cost: { copper: 8 },
    desc: "Tough obstacle. Enemies prefer walking around it - or chew through if it is the short way.",
    key: "5",
  },
};
const TOOL_ORDER = ["conveyor", "drill", "duo", "lancer", "wall"];

const CONVEYOR_SPEED = 1.7;   // tiles per second
const ITEM_GAP = 0.34;        // min spacing between items on a belt
const BELT_CAP = 3;
const DRILL_TIME = 2.2;       // seconds per item (copper)
const MAP_R = 14;

/* ---------------------------------------------------------- game state */
let game = null;

function newGame(seed) {
  const g = {
    seed: seed === undefined ? (Math.random() * 1e9) | 0 : seed,
    tiles: new Map(),
    buildings: [],
    enemies: [],
    projectiles: [],
    particles: [],
    pendingSpawns: [],
    spawnPoints: [],
    res: { copper: 70, titanium: 0 },
    wave: 0,
    waveTimer: 50,
    core: null,
    flow: new Map(),        // key -> cost-to-core
    time: 0,
    over: false,
    paused: false,
  };
  genMap(g);
  computeFlow(g);
  return g;
}

function genMap(g) {
  const rng = mulberry32(g.seed);
  const noise = makeNoise((g.seed ^ 0x9e3779b9) | 0);

  for (let q = -MAP_R; q <= MAP_R; q++) {
    for (let r = -MAP_R; r <= MAP_R; r++) {
      if (hexDist(q, r) > MAP_R) continue;
      const x = hexX(q, r), y = hexY(q, r);
      const n = noise(x * 0.011, y * 0.011);
      const d = hexDist(q, r);
      const rock = n > 0.62 && d > 3 && d < MAP_R; // keep center + rim open
      let floor = "stone";
      if (n < 0.36) floor = "sand";
      else if (n < 0.5) floor = "grass";
      g.tiles.set(key(q, r), {
        q, r, floor, rock, ore: null, building: null,
        shade: (rng() - 0.5) * 0.09,
      });
    }
  }

  // ore veins via random walks
  const floorTiles = [...g.tiles.values()].filter(t => !t.rock);
  const walkVein = (start, ore, len) => {
    let t = start;
    for (let i = 0; i < len && t; i++) {
      if (!t.rock && hexDist(t.q, t.r) > 1) t.ore = ore;
      const [dq, dr] = DIRS[(rng() * 6) | 0];
      t = g.tiles.get(key(t.q + dq, t.r + dr));
    }
  };
  for (let i = 0; i < 11; i++)
    walkVein(floorTiles[(rng() * floorTiles.length) | 0], "copper", 5 + (rng() * 5) | 0);
  for (let i = 0; i < 5; i++) {
    const far = floorTiles.filter(t => hexDist(t.q, t.r) > 6);
    walkVein(far[(rng() * far.length) | 0], "titanium", 4 + (rng() * 4) | 0);
  }
  // guarantee a starter copper vein near the core
  const near = floorTiles.filter(t => { const d = hexDist(t.q, t.r); return d >= 2 && d <= 4; });
  walkVein(near[(rng() * near.length) | 0], "copper", 6);

  // core at the center
  const center = g.tiles.get(key(0, 0));
  center.rock = false; center.ore = null;
  g.core = placeBuilding(g, "core", 0, 0, 0, true);

  // spawn points: reachable tiles on the rim, spread apart
  const reach = bfsReachable(g, key(0, 0));
  const rim = [...g.tiles.values()]
    .filter(t => !t.rock && hexDist(t.q, t.r) >= MAP_R - 1 && reach.has(key(t.q, t.r)));
  const angleOf = t => Math.atan2(hexY(t.q, t.r), hexX(t.q, t.r));
  const picked = [];
  if (rim.length) {
    picked.push(rim[(rng() * rim.length) | 0]);
    while (picked.length < 3 && picked.length < rim.length) {
      let best = null, bestScore = -1;
      for (const t of rim) {
        const score = Math.min(...picked.map(p => {
          let da = Math.abs(angleOf(t) - angleOf(p));
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

/* ---------------------------------------------------- flow field (path) */
// Dijkstra from the core over walkable tiles. Buildings cost extra, so
// enemies route around defenses when possible but breach when it's shorter.
function computeFlow(g) {
  const dist = new Map();
  const frontier = [[key(0, 0), 0]];
  dist.set(key(0, 0), 0);
  while (frontier.length) {
    // linear-scan min (map is small; only recomputed on build/destroy)
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
  g.flow = dist;
}

/* ------------------------------------------------------------ buildings */
function placeBuilding(g, type, q, r, dir, free) {
  const t = g.tiles.get(key(q, r));
  const def = BLOCKS[type];
  const b = {
    type, q, r, dir: dir || 0,
    x: hexX(q, r), y: hexY(q, r),
    hp: def.hp, maxHp: def.hp,
    items: [], buffer: null, mineT: 0, outDir: 0,
    cool: 0, angle: 0, target: null, flash: 0,
  };
  t.building = b;
  g.buildings.push(b);
  if (!free) for (const res in def.cost) g.res[res] -= def.cost[res];
  computeFlow(g);
  return b;
}

function destroyBuilding(g, b, refund) {
  const t = g.tiles.get(key(b.q, b.r));
  if (t && t.building === b) t.building = null;
  const i = g.buildings.indexOf(b);
  if (i >= 0) g.buildings.splice(i, 1);
  if (refund) {
    const def = BLOCKS[b.type];
    for (const res in def.cost) g.res[res] += Math.floor(def.cost[res] / 2);
  } else {
    burst(g, b.x, b.y, "#f0a050", 14, 90);
  }
  if (b.type === "core") gameOver(g);
  computeFlow(g);
}

function canPlace(g, type, q, r) {
  const t = g.tiles.get(key(q, r));
  if (!t || t.rock || t.building) return false;
  const def = BLOCKS[type];
  if (def.needsOre && !t.ore) return false;
  for (const res in def.cost) if (g.res[res] < def.cost[res]) return false;
  return true;
}

function affordable(g, type) {
  const def = BLOCKS[type];
  for (const res in def.cost) if (g.res[res] < def.cost[res]) return false;
  return true;
}

function damageBuilding(g, b, dmg) {
  b.hp -= dmg;
  b.flash = 0.12;
  if (b.hp <= 0) destroyBuilding(g, b, false);
}

/* ------------------------------------------------------------- economy */
function acceptItem(g, b, res) {
  if (b.type === "core") {
    g.res[res] += 1;
    burst(g, b.x, b.y, RES_COLORS[res], 2, 40);
    return true;
  }
  if (b.type === "conveyor") {
    if (b.items.length >= BELT_CAP) return false;
    const tail = b.items[b.items.length - 1];
    if (tail && tail.t < ITEM_GAP) return false;
    b.items.push({ res, t: 0 });
    return true;
  }
  return false;
}

function updateConveyor(g, b, dt) {
  if (!b.items.length) return;
  // items kept sorted front (highest t) first
  for (let i = 0; i < b.items.length; i++) {
    const it = b.items[i];
    const maxT = i === 0 ? 1 : b.items[i - 1].t - ITEM_GAP;
    it.t = Math.min(it.t + CONVEYOR_SPEED * dt, Math.max(maxT, it.t));
  }
  const front = b.items[0];
  if (front.t >= 1) {
    const [dq, dr] = DIRS[b.dir];
    const nt = g.tiles.get(key(b.q + dq, b.r + dr));
    if (nt && nt.building && acceptItem(g, nt.building, front.res)) b.items.shift();
  }
}

function updateDrill(g, b, dt) {
  const t = g.tiles.get(key(b.q, b.r));
  if (!t.ore) return;
  const speed = t.ore === "titanium" ? 1 / 1.5 : 1;
  if (!b.buffer) {
    b.mineT += dt * speed;
    if (b.mineT >= DRILL_TIME) { b.mineT = 0; b.buffer = t.ore; }
  }
  if (b.buffer) {
    for (let i = 0; i < 6; i++) {
      const d = (b.outDir + i) % 6;
      const [dq, dr] = DIRS[d];
      const nt = g.tiles.get(key(b.q + dq, b.r + dr));
      if (nt && nt.building && acceptItem(g, nt.building, b.buffer)) {
        b.buffer = null;
        b.outDir = (d + 1) % 6;
        break;
      }
    }
  }
}

function updateTurret(g, b, dt) {
  const def = BLOCKS[b.type].turret;
  b.cool -= dt;
  // acquire nearest living enemy in range
  let best = null, bestD = def.range * def.range;
  for (const e of g.enemies) {
    const d = dist2(e.x, e.y, b.x, b.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  b.target = best;
  if (best) {
    b.angle = Math.atan2(best.y - b.y, best.x - b.x);
    if (b.cool <= 0) {
      b.cool = def.reload;
      g.projectiles.push({
        x: b.x + Math.cos(b.angle) * HEX * 0.6,
        y: b.y + Math.sin(b.angle) * HEX * 0.6,
        vx: Math.cos(b.angle) * def.pspeed,
        vy: Math.sin(b.angle) * def.pspeed,
        dmg: def.dmg, life: def.range / def.pspeed + 0.12,
        heavy: b.type === "lancer",
      });
      b.muzzle = 0.06;
    }
  }
}

/* -------------------------------------------------------------- enemies */
function spawnEnemy(g, sp, brute) {
  const n = g.wave;
  const hpScale = 30 * Math.pow(1.17, n) + 8 * n;
  const jitter = (Math.random() - 0.5) * HEX;
  g.enemies.push({
    x: hexX(sp.q, sp.r) + jitter, y: hexY(sp.q, sp.r) + jitter,
    hp: brute ? hpScale * 4 : hpScale,
    maxHp: brute ? hpScale * 4 : hpScale,
    speed: brute ? 24 : 34 + Math.min(n, 12),
    dmg: brute ? 20 : 8,
    size: brute ? HEX * 0.62 : HEX * 0.38,
    atk: 0, angle: 0, brute,
  });
}

function updateEnemy(g, e, dt) {
  e.atk -= dt;
  const h = pixelToHex(e.x, e.y);
  const myKey = key(h.q, h.r);
  // pick the neighbor closest to the core along the flow field
  let bestK = null, bestD = g.flow.has(myKey) ? g.flow.get(myKey) : Infinity;
  let bestT = null;
  for (const [dq, dr] of DIRS) {
    const nk = key(h.q + dq, h.r + dr);
    if (!g.flow.has(nk)) continue;
    if (g.flow.get(nk) < bestD) { bestD = g.flow.get(nk); bestK = nk; }
  }
  if (bestK) bestT = g.tiles.get(bestK);

  // something in the way (or the core itself)? attack it when close
  let attackTarget = null;
  if (bestT && bestT.building) attackTarget = bestT.building;
  const myTile = g.tiles.get(myKey);
  if (myTile && myTile.building && myTile.building.type !== "core") attackTarget = myTile.building;

  if (attackTarget) {
    const d = Math.hypot(attackTarget.x - e.x, attackTarget.y - e.y);
    e.angle = Math.atan2(attackTarget.y - e.y, attackTarget.x - e.x);
    if (d > NEIGHBOR_DIST * 0.72) {
      e.x += Math.cos(e.angle) * e.speed * dt;
      e.y += Math.sin(e.angle) * e.speed * dt;
    } else if (e.atk <= 0) {
      e.atk = 0.7;
      damageBuilding(g, attackTarget, e.dmg);
      burst(g, attackTarget.x, attackTarget.y, "#e06060", 3, 60);
      if (game.over) return;
    }
  } else if (bestT) {
    const tx = hexX(bestT.q, bestT.r), ty = hexY(bestT.q, bestT.r);
    e.angle = Math.atan2(ty - e.y, tx - e.x);
    e.x += Math.cos(e.angle) * e.speed * dt;
    e.y += Math.sin(e.angle) * e.speed * dt;
  }
  // gentle separation so packs don't stack into one blob
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

function startWave(g) {
  g.wave++;
  const n = g.wave;
  const count = Math.min(4 + Math.round(n * 1.6), 42);
  for (let i = 0; i < count; i++) {
    const sp = g.spawnPoints[i % g.spawnPoints.length];
    g.pendingSpawns.push({ at: g.time + i * 0.65, sp, brute: false });
  }
  if (n % 4 === 0) {
    for (let i = 0; i < Math.floor(n / 4); i++) {
      const sp = g.spawnPoints[i % g.spawnPoints.length];
      g.pendingSpawns.push({ at: g.time + 2 + i * 1.4, sp, brute: true });
    }
  }
  g.waveTimer = Math.max(24, 40 - n * 0.4);
  showMsg("Wave " + n + " incoming!");
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

  // waves
  g.waveTimer -= dt;
  if (g.waveTimer <= 0) startWave(g);
  for (let i = g.pendingSpawns.length - 1; i >= 0; i--) {
    if (g.time >= g.pendingSpawns[i].at) {
      const s = g.pendingSpawns.splice(i, 1)[0];
      spawnEnemy(g, s.sp, s.brute);
    }
  }

  // buildings
  for (const b of g.buildings) {
    b.flash = Math.max(0, b.flash - dt);
    if (b.muzzle) b.muzzle = Math.max(0, b.muzzle - dt);
    if (b.type === "conveyor") updateConveyor(g, b, dt);
    else if (b.type === "drill") updateDrill(g, b, dt);
    else if (BLOCKS[b.type].turret) updateTurret(g, b, dt);
  }

  // projectiles
  for (let i = g.projectiles.length - 1; i >= 0; i--) {
    const p = g.projectiles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    let hit = false;
    for (const e of g.enemies) {
      if (dist2(p.x, p.y, e.x, e.y) < (e.size + 3) * (e.size + 3)) {
        e.hp -= p.dmg;
        burst(g, p.x, p.y, p.heavy ? "#9db8f0" : "#f0d060", p.heavy ? 6 : 3, 70);
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
      g.res.copper += e.brute ? 10 : 2;
      burst(g, e.x, e.y, "#e06060", 10, 90);
      continue;
    }
    updateEnemy(g, e, dt);
    if (g.over) return;
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

function gameOver(g) {
  if (g.over) return;
  g.over = true;
  document.getElementById("overlay-text").textContent =
    "Your foundry fell on wave " + Math.max(g.wave, 1) + ".";
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
  const span = (MAP_R * 2 + 2) * NEIGHBOR_DIST;
  cam.zoom = Math.min(W, H) / span * 1.08;
  cam.x = 0; cam.y = 0;
}

const FLOOR_COLORS = { stone: "#43434d", sand: "#6b5f4a", grass: "#4c5e45" };

function screenToWorld(sx, sy) {
  return { x: (sx - W / 2) / cam.zoom + cam.x, y: (sy - H / 2) / cam.zoom + cam.y };
}

function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt * 255, g2 = ((n >> 8) & 255) + amt * 255, b = (n & 255) + amt * 255;
  return `rgb(${clamp(r | 0, 0, 255)},${clamp(g2 | 0, 0, 255)},${clamp(b | 0, 0, 255)})`;
}

function draw(g) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#17171c";
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(cam.zoom * DPR, 0, 0, cam.zoom * DPR,
    (W / 2 - cam.x * cam.zoom) * DPR, (H / 2 - cam.y * cam.zoom) * DPR);

  /* terrain */
  for (const t of g.tiles.values()) {
    const x = hexX(t.q, t.r), y = hexY(t.q, t.r);
    hexPath(ctx, x, y, 1.02);
    if (t.rock) {
      ctx.fillStyle = shadeColor("#2a2a31", t.shade);
      ctx.fill();
      hexPath(ctx, x, y, 0.62);
      ctx.fillStyle = shadeColor("#222228", t.shade);
      ctx.fill();
    } else {
      ctx.fillStyle = shadeColor(FLOOR_COLORS[t.floor], t.shade);
      ctx.fill();
      if (t.ore) {
        ctx.fillStyle = RES_COLORS[t.ore];
        for (let i = 0; i < 3; i++) {
          const a = TAU * i / 3 + t.shade * 40;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * HEX * 0.38, y + Math.sin(a) * HEX * 0.38, HEX * 0.14, 0, TAU);
          ctx.fill();
        }
      }
    }
  }
  /* faint grid */
  ctx.strokeStyle = "#00000030";
  ctx.lineWidth = 1;
  for (const t of g.tiles.values()) {
    if (t.rock) continue;
    hexPath(ctx, hexX(t.q, t.r), hexY(t.q, t.r));
    ctx.stroke();
  }

  /* spawn markers */
  const pulse = 0.75 + 0.25 * Math.sin(g.time * 4);
  for (const sp of g.spawnPoints) {
    hexPath(ctx, hexX(sp.q, sp.r), hexY(sp.q, sp.r), 0.85);
    ctx.strokeStyle = `rgba(224,96,96,${pulse})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  /* buildings */
  for (const b of g.buildings) drawBuilding(ctx, b, g.time);

  /* enemies */
  for (const e of g.enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    ctx.fillStyle = e.brute ? "#8f3038" : "#b04048";
    ctx.beginPath();
    ctx.moveTo(e.size, 0);
    ctx.lineTo(-e.size * 0.7, e.size * 0.75);
    ctx.lineTo(-e.size * 0.35, 0);
    ctx.lineTo(-e.size * 0.7, -e.size * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f0d0d0";
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
  if (ui.tool && ui.hover && !g.over) {
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
      ctx.globalAlpha = 0.55;
      drawBuilding(ctx, { type: ui.tool, x, y, dir: ui.dir, items: [], hp: 1, maxHp: 1, flash: 0, angle: 0, mineT: 0 }, g.time);
      ctx.globalAlpha = 1;
      hexPath(ctx, x, y);
      ctx.strokeStyle = ok ? "#70e080" : "#e06060";
      ctx.lineWidth = 2;
      ctx.stroke();
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
  const def = BLOCKS[b.type];
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
    case "conveyor": {
      hexPath(c, x, y, 0.96);
      c.fillStyle = "#33333c";
      c.fill();
      const v = DIRVEC[b.dir];
      // animated chevrons
      c.strokeStyle = "#55555f";
      c.lineWidth = 3;
      const anim = (time * CONVEYOR_SPEED) % 0.5;
      for (let i = 0; i < 2; i++) {
        const t = anim + i * 0.5;
        const px = x + v.x * (t - 0.5) * NEIGHBOR_DIST * 0.8;
        const py = y + v.y * (t - 0.5) * NEIGHBOR_DIST * 0.8;
        const nx = -v.y, ny = v.x;
        c.beginPath();
        c.moveTo(px - v.x * 4 + nx * 5, py - v.y * 4 + ny * 5);
        c.lineTo(px + v.x * 2, py + v.y * 2);
        c.lineTo(px - v.x * 4 - nx * 5, py - v.y * 4 - ny * 5);
        c.stroke();
      }
      // items
      for (const it of b.items) {
        const px = x + v.x * (it.t - 0.5) * NEIGHBOR_DIST;
        const py = y + v.y * (it.t - 0.5) * NEIGHBOR_DIST;
        c.fillStyle = RES_COLORS[it.res];
        c.fillRect(px - 4, py - 4, 8, 8);
        c.strokeStyle = "#00000060";
        c.lineWidth = 1;
        c.strokeRect(px - 4, py - 4, 8, 8);
      }
      break;
    }
    case "drill": {
      hexPath(c, x, y, 0.96);
      c.fillStyle = "#4a4438";
      c.fill();
      c.save();
      c.translate(x, y);
      c.rotate(time * 2.2);
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
      c.fillStyle = b.buffer ? RES_COLORS[b.buffer] : "#2c2c33";
      c.beginPath();
      c.arc(x, y, HEX * 0.22, 0, TAU);
      c.fill();
      break;
    }
    case "duo":
    case "lancer": {
      const heavy = b.type === "lancer";
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
  // damage flash + hp bar
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
  tool: null, dir: 0, hover: null,
  panning: false, painting: false, erasing: false,
  lastPaint: null,
  keys: {},
};

function showMsg(text) {
  const el = document.getElementById("msg");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* toolbar */
function buildToolbar() {
  const bar = document.getElementById("toolbar");
  bar.innerHTML = "";
  for (const type of TOOL_ORDER) {
    const def = BLOCKS[type];
    const el = document.createElement("div");
    el.className = "tool";
    el.dataset.type = type;
    const ic = document.createElement("canvas");
    ic.width = 68; ic.height = 68;
    const icx = ic.getContext("2d");
    icx.translate(34, 34);
    icx.scale(34 / (HEX * 1.25), 34 / (HEX * 1.25));
    drawBuilding(icx, { type, x: 0, y: 0, dir: 0, items: [], hp: 1, maxHp: 1, flash: 0, angle: -0.5, mineT: 0 }, 0.2);
    const name = document.createElement("div");
    name.className = "tname";
    name.textContent = def.name;
    const cost = document.createElement("div");
    cost.className = "tcost";
    el.append(ic, name, cost);
    el.addEventListener("click", () => selectTool(ui.tool === type ? null : type));
    el.addEventListener("mouseenter", ev => {
      const tip = document.getElementById("tooltip");
      tip.innerHTML = `<b>${def.name}</b> [${def.key}] — ${Object.entries(def.cost).map(([r, n]) => n + " " + r).join(", ") || "free"}<br>${def.desc}`;
      tip.style.display = "block";
      const rect = el.getBoundingClientRect();
      tip.style.left = clamp(rect.left, 8, W - 246) + "px";
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
    const def = BLOCKS[type];
    el.classList.toggle("selected", ui.tool === type);
    const parts = Object.entries(def.cost).map(([r, n]) =>
      `<span class="${game.res[r] >= n ? "" : "no"}">${n} ${r === "titanium" ? "titan" : r}</span>`);
    el.querySelector(".tcost").innerHTML = parts.join(" ") || "free";
  }
}

function selectTool(type) {
  ui.tool = type;
  refreshToolbar();
}

function refreshHud(g) {
  document.getElementById("res-copper").textContent = Math.floor(g.res.copper);
  document.getElementById("res-titanium").textContent = Math.floor(g.res.titanium);
  document.getElementById("wave-num").textContent = g.wave;
  const wt = document.getElementById("wave-timer");
  wt.textContent = g.enemies.length || g.pendingSpawns.length
    ? g.enemies.length + " enemies"
    : "next: " + Math.ceil(g.waveTimer) + "s";
  document.getElementById("core-hp").style.width =
    (g.core ? clamp(g.core.hp / g.core.maxHp, 0, 1) * 100 : 0) + "%";
}

/* placement */
function tryBuild(g, q, r) {
  if (!ui.tool || !canPlace(g, ui.tool, q, r)) return false;
  placeBuilding(g, ui.tool, q, r, ui.dir, false);
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

/* mouse */
canvas.addEventListener("mousedown", ev => {
  if (game.over) return;
  if (ev.button === 1 || (ev.button === 0 && ui.keys[" "])) {
    ui.panning = true;
    ev.preventDefault();
    return;
  }
  const w = screenToWorld(ev.clientX, ev.clientY);
  const h = pixelToHex(w.x, w.y);
  if (ev.button === 0) {
    if (ui.tool) {
      ui.painting = true;
      ui.lastPaint = h;
      tryBuild(game, h.q, h.r);
    }
  } else if (ev.button === 2) {
    ui.erasing = true;
    tryDemolish(game, h.q, h.r);
  }
});
canvas.addEventListener("mousemove", ev => {
  if (ui.panning) {
    cam.x -= ev.movementX / cam.zoom;
    cam.y -= ev.movementY / cam.zoom;
    return;
  }
  const w = screenToWorld(ev.clientX, ev.clientY);
  const h = pixelToHex(w.x, w.y);
  ui.hover = h;
  if (ui.painting && ui.tool) {
    if (!ui.lastPaint || ui.lastPaint.q !== h.q || ui.lastPaint.r !== h.r) {
      // auto-rotate conveyors along the drag direction
      if (ui.tool === "conveyor" && ui.lastPaint) {
        const dq = h.q - ui.lastPaint.q, dr = h.r - ui.lastPaint.r;
        const di = DIRS.findIndex(d => d[0] === dq && d[1] === dr);
        if (di >= 0) {
          ui.dir = di;
          const prev = game.tiles.get(key(ui.lastPaint.q, ui.lastPaint.r));
          if (prev && prev.building && prev.building.type === "conveyor") prev.building.dir = di;
        }
      }
      ui.lastPaint = h;
      tryBuild(game, h.q, h.r);
    }
  }
  if (ui.erasing) tryDemolish(game, h.q, h.r);
});
window.addEventListener("mouseup", () => {
  ui.panning = false; ui.painting = false; ui.erasing = false; ui.lastPaint = null;
});
canvas.addEventListener("contextmenu", ev => ev.preventDefault());
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
  if (k === "r") {
    ui.dir = (ui.dir + 1) % 6;
  } else if (k === "escape") {
    selectTool(null);
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

document.getElementById("restart-btn").addEventListener("click", () => {
  document.getElementById("overlay").classList.add("hidden");
  game = newGame();
  fitCamera();
  selectTool(null);
  showMsg("A new foundry rises.");
});

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

/* -------------------------------------------------------------- boot */
game = newGame();
fitCamera();
buildToolbar();
refreshToolbar();
showMsg("Build drills on ore, conveyors to the core, turrets before the wave!");
requestAnimationFrame(frame);

// exposed for debugging / testing
window.GAME = {
  get game() { return game; },
  tick, placeBuilding, canPlace, newGame,
  setGame(g) { game = g; },
};
