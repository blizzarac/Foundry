/* =========================================================================
   IRONHEX — a turn-based hex roguelike with souls-like combat, set in a
   dead machine world. You are a salvaged combat frame; everything still
   running down here wants you for parts.

   The one rule that makes it skill: combat is DETERMINISTIC and fully
   telegraphed. Every enemy shows exactly which hexes it will strike next
   turn. Every death is a misread, never a dice roll.

   Souls toolkit, re-cast in hardware: power discipline, a thruster dash
   that passes through bodies, deflect -> overload -> counterstrike, hits
   into an exposed core from behind, repair cells that cost a turn to
   inject, repair bays that reinitialize the sector, cores spent on
   fabrication, and a wreck that persists across runs.
   ========================================================================= */
"use strict";

/* ---------------------------------------------------------------- utils */
const SQ3 = Math.sqrt(3);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------- hex math */
const HEX = 30;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const key = (q, r) => q + "," + r;
const unkey = k => k.split(",").map(Number);
const hexX = (q, r) => HEX * (SQ3 * q + SQ3 / 2 * r);
const hexY = (q, r) => HEX * 1.5 * r;
const hexDist = (aq, ar, bq, br) => {
  const dq = aq - bq, dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};
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
// all hexes on the line from a to b (inclusive), by cube lerp + rounding
function hexLine(aq, ar, bq, br) {
  const n = hexDist(aq, ar, bq, br);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const q = lerp(aq, bq, t), r = lerp(ar, br, t), s = lerp(-aq - ar, -bq - br, t);
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    out.push([rq, rr]);
  }
  return out;
}
// direction index from a toward b if exactly aligned on an axis, else -1
function axisDir(aq, ar, bq, br) {
  const dq = bq - aq, dr = br - ar;
  for (let i = 0; i < 6; i++) {
    const [q, r] = DIRS[i];
    if (q === 0 && dq === 0 && Math.sign(dr) === Math.sign(r)) return i;
    if (r === 0 && dr === 0 && Math.sign(dq) === Math.sign(q)) return i;
    if (q !== 0 && r !== 0 && dq % q === 0 && dr % r === 0 &&
        dq / q === dr / r && dq / q > 0) return i;
  }
  return -1;
}
const HEXPTS = [];
for (let i = 0; i < 6; i++) {
  const a = TAU * (i + 0.5) / 6 + Math.PI / 6;
  HEXPTS.push([Math.sin(a) * HEX, -Math.cos(a) * HEX]);
}
function hexPath(c, x, y, s = 1) {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const p = HEXPTS[i];
    if (i === 0) c.moveTo(x + p[0] * s, y + p[1] * s);
    else c.lineTo(x + p[0] * s, y + p[1] * s);
  }
  c.closePath();
}

/* -------------------------------------------------------------- content */
const ENEMY = {
  scrapper: { name: "Scrapper",   hp: 4,  dmg: 3, windup: 1, souls: 10, color: "#a95a3c" },
  railer:   { name: "Rail Drone", hp: 3,  dmg: 2, windup: 1, souls: 12, color: "#b09340", range: 6 },
  bulwark:  { name: "Bulwark",    hp: 6,  dmg: 4, windup: 1, souls: 18, color: "#5f7f9c" },
  mortar:   { name: "Mortar",     hp: 4,  dmg: 4, windup: 2, souls: 20, color: "#a8703c" },
  crusher:  { name: "Crusher",    hp: 9,  dmg: 5, windup: 2, souls: 25, color: "#56505e" },
  ripper:   { name: "Ripper",     hp: 5,  dmg: 4, windup: 1, souls: 16, color: "#8a4fa0" },
  boss:     { name: "the OVERSEER", hp: 34, dmg: 5, windup: 1, souls: 0, color: "#d4c45c" },
};
const TRAITS = {
  scrapper: "Salvage bot running a broken loop. Closes and swings.",
  railer:   "Rail slug rakes an entire lane — it does not check for friendlies. Must recharge after each shot.",
  bulwark:  "Frontal shield emitter absorbs everything it faces. Flank it, or deflect to overload the field. Resets after swinging.",
  mortar:   "Arcs charges over walls — a wide blast, two turns out. Cover is no cover. Reloads after firing.",
  crusher:  "Slow siege chassis. Shockwaves everything adjacent — then its servos lock up.",
  ripper:   "Covers two hexes a turn. Blades sized for your spine.",
  boss:     "Overheats after every third attack. Below half integrity, it calls the fabricators.",
};
const FLOORS = [
  { R: 8, spawn: { scrapper: 4, railer: 1 } },
  { R: 8, spawn: { scrapper: 3, railer: 2, bulwark: 1, crusher: 1 }, elite: true, terminal: true },
  { R: 9, spawn: { scrapper: 4, railer: 2, bulwark: 1, crusher: 1, ripper: 1, mortar: 1 }, elite: true, terminal: true },
  { R: 9, spawn: { scrapper: 4, railer: 2, bulwark: 2, crusher: 2, ripper: 2, mortar: 1 }, elite: true, terminal: true },
  { R: 7, boss: true },
];
const FLASK_HEAL = 8;
const ELITE_TYPES = ["crusher", "ripper", "bulwark"];

/* ------------------------------------------------------------ items */
const BAG_SIZE = 6;
const WEAPON_BASES = {
  blade:   { name: "Blade",   dmg: 2, atkCost: 1, rollCost: 2, bsBonus: 2,
             desc: "Balanced servo-driven arc blade. Answers most things." },
  shiv:    { name: "Shiv",    dmg: 1, atkCost: 1, rollCost: 1, bsBonus: 4,
             desc: "Light frame: dashes cost 1 power. Weak swings, devastating into an exposed core (+4)." },
  cleaver: { name: "Cleaver", dmg: 4, atkCost: 2, rollCost: 2, bsBonus: 2, cleave: true,
             desc: "Plasma discharge (2 power) cleaves a three-hex arc." },
  lance:   { name: "Lance",   dmg: 2, atkCost: 1, rollCost: 2, bsBonus: 2, reach: true,
             desc: "Reach: strike two hexes down a line — outside most claws." },
};
const PLUS_NAMES = ["", "Calibrated ", "Overcharged ", "Prototype "];
const AFFIXES = {
  siphon:    { label: "[Siphon]",    desc: "Recover 1 integrity with every kill." },
  deflector: { label: "[Deflector]", desc: "Deflect costs 1 power." },
  servos:    { label: "[Servos]",    desc: "Dashes cost 1 less power." },
};
const MODULES = {
  plating:   { name: "Ablative Plating", desc: "+3 max integrity." },
  gyro:      { name: "Gyro Stabilizer",  desc: "Dashes cost 1 less power." },
  targeting: { name: "Targeting Chip",   desc: "+1 weapon damage." },
  salvage:   { name: "Salvage Protocol", desc: "A third more cores from kills." },
  regulator: { name: "Nanite Regulator", desc: "Repair cells restore +3." },
};
const CONSUMABLES = {
  dart: { name: "Shock Dart", desc: "Hurl down a clear lane: 4 damage to the first machine, up to 4 hexes. Costs the turn." },
  cell: { name: "Power Cell", desc: "Restore all power and 2 integrity. Costs the turn." },
};
let itemSeq = 0;
function mkWeapon(base, plus, affix) {
  const b = WEAPON_BASES[base];
  return {
    id: ++itemSeq, type: "weapon", base, plus: plus || 0, affix: affix || null,
    name: PLUS_NAMES[plus || 0] + b.name + (affix ? " " + AFFIXES[affix].label : ""),
    desc: b.desc + ((plus || 0) ? ` +${plus} damage.` : "") + (affix ? " " + AFFIXES[affix].desc : ""),
  };
}
function mkModule(kind) {
  return { id: ++itemSeq, type: "module", kind, name: MODULES[kind].name, desc: MODULES[kind].desc };
}
function mkConsumable(kind) {
  return { id: ++itemSeq, type: "consumable", kind, name: CONSUMABLES[kind].name, desc: CONSUMABLES[kind].desc };
}
// depth-scaled loot roll
function rollLoot(rng, depth, elite) {
  const roll = rng();
  const wChance = elite ? 0.5 : 0.4;
  if (roll < wChance) {
    const bases = Object.keys(WEAPON_BASES);
    const base = bases[(rng() * bases.length) | 0];
    let plus = Math.min(3, (rng() * (depth >= 4 ? 3 : depth >= 2 ? 2.4 : 1.6)) | 0);
    if (elite) plus = Math.min(3, plus + 1);
    const affix = rng() < (elite ? 0.55 : 0.28)
      ? Object.keys(AFFIXES)[(rng() * 3) | 0] : null;
    return mkWeapon(base, plus, affix);
  }
  if (roll < wChance + 0.3) {
    const kinds = Object.keys(MODULES);
    return mkModule(kinds[(rng() * kinds.length) | 0]);
  }
  return mkConsumable(rng() < 0.6 ? "dart" : "cell");
}
const UPGRADES = [
  { id: "hp",    name: "Chassis reinforcement", desc: "+4 max integrity", base: 30, apply: p => { p.baseMaxHp += 4; p.hp += 4; } },
  { id: "st",    name: "Capacitor bank",        desc: "+1 max power",     base: 50, apply: p => { p.maxSt += 1; p.st += 1; } },
  { id: "dmg",   name: "Weapon calibration",    desc: "+1 weapon damage", base: 60, apply: p => { p.bonusDmg += 1; } },
  { id: "flask", name: "Nanite reservoir",      desc: "+1 repair cell",   base: 40, apply: p => { p.maxFlask += 1; p.flask += 1; } },
];
const PACTS = [
  { id: "overclock", name: "OVERCLOCK protocol", desc: "+2 weapon damage · −3 max integrity",
    can: p => p.baseMaxHp > 5, apply: p => { p.bonusDmg += 2; p.baseMaxHp -= 3; } },
  { id: "ballast",   name: "BALLAST protocol",   desc: "+6 max integrity · dashes cost +1 power",
    can: () => true, apply: p => { p.baseMaxHp += 6; p.hp += 6; p.rollDelta += 1; } },
  { id: "thruster",  name: "THRUSTER protocol",  desc: "Dashes cost 1 power · −2 max integrity",
    can: p => !p.ashPact && p.baseMaxHp > 4, apply: p => { p.ashPact = true; p.baseMaxHp -= 2; } },
  { id: "scavenge",  name: "SCAVENGER protocol", desc: "+70 cores, right now · −2 max integrity",
    can: p => p.baseMaxHp > 4, apply: p => { p.souls += 70; p.baseMaxHp -= 2; } },
];

/* ------------------------------------------------------------ game state */
let run = null;
let eid = 0;

function persist() {
  try { return JSON.parse(localStorage.getItem("ironhex") || "{}"); } catch (e) { return {}; }
}
function savePersist(p) {
  try { localStorage.setItem("ironhex", JSON.stringify(p)); } catch (e) { /* private mode */ }
}

function newRun(seed) {
  run = {
    seed: seed === undefined ? (Math.random() * 1e9) | 0 : seed,
    floor: 0,
    player: {
      q: 0, r: 0, hp: 12, st: 3, maxSt: 3,
      // base fields (pacts/upgrades mutate these); recalc() derives the rest
      baseMaxHp: 12, bonusDmg: 0, rollDelta: 0, ashPact: false,
      weapon: null, modules: [null, null], bag: [],
      flask: 3, maxFlask: 3, souls: 0, parry: false, parryHit: false, dead: false,
    },
    tiles: new Map(),
    enemies: [],
    shards: [],
    chests: [], groundLoot: [],
    stairs: null, bay: null, bloodstain: null, terminal: null,
    turn: 0, kills: 0, over: false, won: false,
    log: [],
  };
  const p = run.player;
  p.weapon = mkWeapon("blade", 0, null);
  p.weapon.name = "Scrap Blade";
  p.weapon.desc = "Cut from a dead frame's arm. Barely holds a charge — find better steel.";
  p.bag.push(mkConsumable("dart"));
  recalc();
  descend();
  return run;
}

/* derive combat stats from weapon + modules + protocols/upgrades */
const hasModule = kind => run.player.modules.some(c => c && c.kind === kind);
const countModule = kind => run.player.modules.filter(c => c && c.kind === kind).length;
function recalc() {
  const p = run.player;
  const b = WEAPON_BASES[p.weapon.base];
  p.dmg = b.dmg + p.weapon.plus + p.bonusDmg + countModule("targeting");
  p.atkCost = b.atkCost;
  p.bsBonus = b.bsBonus;
  p.cleave = !!b.cleave;
  p.reach = !!b.reach;
  p.rollCost = p.ashPact ? 1 :
    clamp(b.rollCost + p.rollDelta
      - (hasModule("gyro") ? 1 : 0)
      - (p.weapon.affix === "servos" ? 1 : 0), 1, 4);
  p.parryCost = p.weapon.affix === "deflector" ? 1 : 2;
  p.maxHp = p.baseMaxHp + 3 * countModule("plating");
  p.hp = Math.min(p.hp, p.maxHp);
}
const flaskHeal = () => FLASK_HEAL + (hasModule("regulator") ? 3 : 0);

function log(msg, cls) {
  run.log.push({ msg, cls: cls || "", t: run.turn });
  if (run.log.length > 40) run.log.shift();
  renderLog();
}

/* ------------------------------------------------------------ floor gen */
function genFloor() {
  const f = FLOORS[run.floor - 1];
  const rng = mulberry32((run.seed ^ (run.floor * 0x9e3779b9)) >>> 0);
  run.tiles = new Map();
  run.enemies = [];
  run.shards = [];
  run.chests = [];
  run.groundLoot = [];
  run.bloodstain = null;
  run.terminal = null;
  const R = f.R;

  if (f.boss) {
    // open arena with a few pillars
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) {
      if (hexDist(q, r, 0, 0) > R) continue;
      run.tiles.set(key(q, r), { q, r, rock: hexDist(q, r, 0, 0) === R, shade: (rng() - 0.5) * 0.08, explored: false });
    }
    for (let i = 0; i < 6; i++) {
      const a = TAU * i / 6 + 0.4;
      const q = Math.round(Math.cos(a) * 4.2), r = Math.round(Math.sin(a) * 3.4 - Math.cos(a) * 2.1);
      const t = run.tiles.get(key(q, r));
      if (t && hexDist(q, r, 0, 0) > 1) t.rock = true;
    }
    run.player.q = 0; run.player.r = R - 1;
    const t0 = run.tiles.get(key(0, R - 1));
    if (t0) t0.rock = false;
    run.bay = { q: 0, r: R - 2, used: false };
    const tb = run.tiles.get(key(0, R - 2));
    if (tb) tb.rock = false;
    // a last armory before the King: guaranteed strong steel
    const tc = run.tiles.get(key(1, R - 2));
    if (tc) {
      tc.rock = false;
      const crng = mulberry32((run.seed ^ 0xbeef) >>> 0);
      const bases = Object.keys(WEAPON_BASES);
      run.chests.push({ q: 1, r: R - 2, opened: false,
        item: mkWeapon(bases[(crng() * bases.length) | 0], 2,
          Object.keys(AFFIXES)[(crng() * 3) | 0]) });
    }
    spawnEnemy("boss", 0, -2);
    run.stairs = null;
    updateFov();
    return;
  }

  // cavern: noise rock, keep the largest open region
  for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) {
    const d = hexDist(q, r, 0, 0);
    if (d > R) continue;
    const rock = d === R || rng() < 0.30;
    run.tiles.set(key(q, r), { q, r, rock, shade: (rng() - 0.5) * 0.08, explored: false });
  }
  // largest connected floor component
  const seen = new Set();
  let bigBest = [];
  for (const t of run.tiles.values()) {
    if (t.rock || seen.has(key(t.q, t.r))) continue;
    const comp = [], stack = [key(t.q, t.r)];
    seen.add(stack[0]);
    while (stack.length) {
      const k = stack.pop();
      comp.push(k);
      const [q, r] = unkey(k);
      for (const [dq, dr] of DIRS) {
        const nk = key(q + dq, r + dr);
        const nt = run.tiles.get(nk);
        if (nt && !nt.rock && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    if (comp.length > bigBest.length) bigBest = comp;
  }
  const open = new Set(bigBest);
  for (const t of run.tiles.values()) if (!open.has(key(t.q, t.r))) t.rock = true;
  const floorKeys = [...open];
  const pick = arr => arr[(rng() * arr.length) | 0];

  // player spawns at a rim-ish tile; stairs at max distance from spawn
  const rim = floorKeys.filter(k => { const [q, r] = unkey(k); return hexDist(q, r, 0, 0) >= R - 3; });
  const pk = pick(rim.length ? rim : floorKeys);
  [run.player.q, run.player.r] = unkey(pk);
  const dist = bfsDist(pk);
  let far = floorKeys[0], fd = -1;
  for (const k of floorKeys) {
    const d = dist.get(k);
    if (d !== undefined && d > fd) { fd = d; far = k; }
  }
  const [sq, sr] = unkey(far);
  run.stairs = { q: sq, r: sr };
  // repair bay roughly midway
  const mid = floorKeys.filter(k => {
    const d = dist.get(k);
    return d !== undefined && Math.abs(d - fd / 2) <= 2 && k !== pk && k !== far;
  });
  const bk = pick(mid.length ? mid : floorKeys);
  run.bay = { q: unkey(bk)[0], r: unkey(bk)[1], used: false };

  // enemies: keep distance from spawn
  const freeFor = k => {
    const d = dist.get(k);
    return d !== undefined && d >= 5 && k !== far && k !== bk &&
      !run.enemies.some(e => key(e.q, e.r) === k);
  };
  const spots = floorKeys.filter(freeFor);
  let elitePlaced = !f.elite;
  for (const [type, n] of Object.entries(f.spawn)) {
    for (let i = 0; i < n; i++) {
      const cand = spots.filter(freeFor);
      if (!cand.length) break;
      const k = pick(cand);
      const [q, r] = unkey(k);
      const e = spawnEnemy(type, q, r);
      if (!elitePlaced && ELITE_TYPES.includes(type)) {
        e.elite = true;
        e.hp = e.maxHp = Math.round(e.maxHp * 1.5);
        e.dmg += 1;
        elitePlaced = true;
      }
    }
  }
  // souls shards
  for (let i = 0; i < 3; i++) {
    const cand = floorKeys.filter(k => k !== pk && k !== far && k !== bk &&
      !run.shards.some(s => key(s.q, s.r) === k));
    if (!cand.length) break;
    const [q, r] = unkey(pick(cand));
    run.shards.push({ q, r, souls: 20 });
  }
  // chests: the other reason to explore
  const nChests = run.floor >= 3 ? 2 : 1;
  for (let i = 0; i < nChests; i++) {
    const cand = floorKeys.filter(k => {
      const d = dist.get(k);
      return d !== undefined && d >= 4 && k !== far && k !== bk &&
        !run.shards.some(s => key(s.q, s.r) === k) &&
        !run.chests.some(c => key(c.q, c.r) === k);
    });
    if (!cand.length) break;
    const [q, r] = unkey(pick(cand));
    run.chests.push({ q, r, opened: false,
      item: rollLoot(mulberry32((run.seed ^ (run.floor * 131 + i * 37)) >>> 0), run.floor, false) });
  }

  // corrupted terminal: a protocol, if you dare
  if (f.terminal) {
    const cand = floorKeys.filter(k => {
      const d = dist.get(k);
      return d !== undefined && d >= 4 && k !== far && k !== bk &&
        !run.shards.some(s => key(s.q, s.r) === k) &&
        !run.enemies.some(e => key(e.q, e.r) === k);
    });
    if (cand.length) {
      const [q, r] = unkey(pick(cand));
      run.terminal = { q, r, used: false };
    }
  }

  // predecessor's bloodstain
  const p = persist();
  if (p.stain && p.stain.floor === run.floor && p.stain.souls > 0) {
    const cand = floorKeys.filter(k => {
      const d = dist.get(k);
      return d !== undefined && d >= 3 && k !== far;
    });
    if (cand.length) {
      const [q, r] = unkey(pick(cand));
      run.bloodstain = { q, r, souls: p.stain.souls };
    }
  }
  updateFov();
}

function spawnEnemy(type, q, r) {
  const d = ENEMY[type];
  const e = {
    id: ++eid, type, q, r,
    hp: d.hp, maxHp: d.hp, dmg: d.dmg,
    dir: 0, state: "idle", windupHexes: [], windupTimer: 0,
    stagger: 0, moveToggle: false, elite: false,
    bossCount: 0, bossPhase2: false,
  };
  run.enemies.push(e);
  return e;
}

function descend() {
  run.floor++;
  genFloor();
  log(run.floor === 5 ? "OVERSEER core detected." : "Sector " + run.floor + ".", "sys");
  centerCam();
  invalidateFloorCaches();
}

/* --------------------------------------------------------------- pathing */
function bfsDist(fromKey) {
  const dist = new Map([[fromKey, 0]]);
  const queue = [fromKey];
  let qi = 0;
  while (qi < queue.length) {
    const k = queue[qi++];
    const [q, r] = unkey(k);
    for (const [dq, dr] of DIRS) {
      const nk = key(q + dq, r + dr);
      const nt = run.tiles.get(nk);
      if (!nt || nt.rock || dist.has(nk)) continue;
      dist.set(nk, dist.get(k) + 1);
      queue.push(nk);
    }
  }
  return dist;
}
const occupied = (q, r) =>
  (run.player.q === q && run.player.r === r) ||
  run.enemies.some(e => e.q === q && e.r === r);
const walkable = (q, r) => {
  const t = run.tiles.get(key(q, r));
  return !!t && !t.rock;
};

/* ------------------------------------------------------------------ FOV */
const FOV_R = 7;
function losClear(aq, ar, bq, br) {
  const line = hexLine(aq, ar, bq, br);
  for (let i = 1; i < line.length - 1; i++) {
    const t = run.tiles.get(key(line[i][0], line[i][1]));
    if (!t || t.rock) return false;
  }
  return true;
}
let visible = new Set();
function updateFov() {
  visible = new Set();
  const { q: pq, r: pr } = run.player;
  for (const t of run.tiles.values()) {
    if (hexDist(t.q, t.r, pq, pr) > FOV_R) continue;
    if (losClear(pq, pr, t.q, t.r)) {
      visible.add(key(t.q, t.r));
      t.explored = true;
    }
  }
  fogDirty = true;
}

/* ------------------------------------------------------------ turn engine */
// Player actions. Each returns true if the turn was consumed.
function canAfford(cost) { return run.player.st >= cost; }

function actStep(dq, dr) {
  const p = run.player;
  const q = p.q + dq, r = p.r + dr;
  if (!walkable(q, r) || occupied(q, r)) return false;
  p.q = q; p.r = r;
  p.st = Math.min(p.maxSt, p.st + 1);
  afterPlayerMove();
  endTurn();
  return true;
}
function actWait() {
  run.player.st = Math.min(run.player.maxSt, run.player.st + 2);
  endTurn();
  return true;
}
function strikeOne(e, primary) {
  const p = run.player;
  const toPlayer = axisDir(e.q, e.r, p.q, p.r);   // works adjacent or at reach
  const front = [e.dir, (e.dir + 1) % 6, (e.dir + 5) % 6].includes(toPlayer);
  const rear = [(e.dir + 3) % 6, (e.dir + 2) % 6, (e.dir + 4) % 6].includes(toPlayer);
  // bulwark shield: frontal hits scatter unless the field is overloaded
  if (e.type === "bulwark" && front && e.stagger === 0) {
    addFloat(e.q, e.r, "deflected", "#9ac8e0");
    if (primary) log("Your strike scatters off the Bulwark's shield field.", "warn");
    sfx("block");
    return;
  }
  let dmg = p.dmg + (rear && primary ? p.bsBonus : 0);
  if (e.stagger > 0) dmg *= 2;
  hurtEnemy(e, dmg, rear && primary ? "backstab" : e.stagger > 0 ? "riposte" : null);
}

function canReach(e) {
  const p = run.player;
  const d = hexDist(p.q, p.r, e.q, e.r);
  if (d === 1) return true;
  if (d === 2 && p.reach) {
    // spear poke: straight line, and the hex between must be open air
    const dir = axisDir(p.q, p.r, e.q, e.r);
    if (dir < 0) return false;
    const mq = p.q + DIRS[dir][0], mr = p.r + DIRS[dir][1];
    return walkable(mq, mr) && !occupied(mq, mr);
  }
  return false;
}

function actAttack(e) {
  const p = run.player;
  if (!canReach(e) || !canAfford(p.atkCost)) return false;
  p.st -= p.atkCost;
  // lunge animation nudge
  p.bumpX = (hexX(e.q, e.r) - hexX(p.q, p.r)) * 0.3;
  p.bumpY = (hexY(e.q, e.r) - hexY(p.q, p.r)) * 0.3;
  sfx("strike");
  strikeOne(e, true);
  if (p.cleave && hexDist(p.q, p.r, e.q, e.r) === 1) {
    // the grave axe carves the target's hex and its two flanking neighbors
    const d = DIRS.findIndex(([dq, dr]) => p.q + dq === e.q && p.r + dr === e.r);
    for (const dd of [(d + 1) % 6, (d + 5) % 6]) {
      const q = p.q + DIRS[dd][0], r = p.r + DIRS[dd][1];
      const other = run.enemies.find(o => o.q === q && o.r === r);
      if (other) strikeOne(other, false);
      if (run.over) return true;
    }
  }
  endTurn();
  return true;
}
function actRoll(dq, dr) {
  // 2 hexes along one direction; pass through anything but rock; land free
  const p = run.player;
  if (!canAfford(p.rollCost)) return false;
  const d = DIRS.findIndex(([q, r]) => q === dq && r === dr);
  if (d < 0) return false;
  const mq = p.q + dq, mr = p.r + dr;
  const lq = p.q + dq * 2, lr = p.r + dr * 2;
  const mt = run.tiles.get(key(mq, mr));
  if (!mt || mt.rock) return false;           // can't roll into a wall
  if (!walkable(lq, lr) || occupied(lq, lr)) return false;
  p.st -= p.rollCost;
  p.q = lq; p.r = lr;
  log("Thrusters fire.", "");
  sfx("dash");
  afterPlayerMove();
  endTurn();
  return true;
}
function actParry() {
  const p = run.player;
  if (!canAfford(p.parryCost)) return false;
  p.st -= p.parryCost;
  p.parry = true;
  p.parryHit = false;
  endTurn();
  if (!p.parryHit && !run.over) log("Your deflector closes on nothing.", "warn");
  return true;
}
function actFlask() {
  const p = run.player;
  if (p.flask <= 0 || p.hp >= p.maxHp) return false;
  p.flask -= 1;
  const heal = flaskHeal();
  p.hp = Math.min(p.maxHp, p.hp + heal);
  sfx("repair");
  log("Repair cell injected.", "good");
  addFloat(p.q, p.r, "+" + heal, "#5fe0aa");
  endTurn();
  return true;
}
function actRest() {
  const p = run.player;
  const b = run.bay;
  if (!b || b.used || hexDist(p.q, p.r, b.q, b.r) > 1) return false;
  b.used = true;
  p.hp = p.maxHp;
  p.flask = p.maxFlask;
  p.st = p.maxSt;
  // souls trade-off: the floor stirs back to life
  if (run.floor < 5) {
    const f = FLOORS[run.floor - 1];
    const dist = bfsDist(key(p.q, p.r));
    const spots = [...run.tiles.values()].filter(t => {
      const d = dist.get(key(t.q, t.r));
      return !t.rock && d !== undefined && d >= 5 && !occupied(t.q, t.r);
    });
    const rng = mulberry32((run.seed ^ (run.floor * 7919) ^ 0x5f5f) >>> 0);
    let n = 0;
    for (const [type, cnt] of Object.entries(f.spawn)) {
      for (let i = 0; i < cnt && spots.length; i++) {
        if (run.enemies.filter(e => e.type === type).length >=cnt) continue;
        const idx = (rng() * spots.length) | 0;
        const t = spots.splice(idx, 1)[0];
        spawnEnemy(type, t.q, t.r);
        n++;
      }
    }
    if (n) log("Docked. Systems restored — but the sector reinitializes.", "warn");
    else log("Docked. Systems restored.", "good");
  } else {
    log("Docked. Beyond this bay: the OVERSEER.", "good");
  }
  showShop();
  render();
  refreshHud();
  return true;
}

/* ---------------------------------------------------------- inventory */
function giveItem(item) {
  if (run.player.bag.length >= BAG_SIZE) return false;
  run.player.bag.push(item);
  return true;
}
// gear-fiddling is free in peace; under hostile eyes it costs the turn
function inCombat() {
  return run.enemies.some(e => e.awake && visible.has(key(e.q, e.r)));
}
function spendGearTurn() {
  if (inCombat() && !run.over) {
    log("You swap hardware with hostiles in sensor range.", "warn");
    endTurn();
    return true;
  }
  return false;
}
function equipItem(idx) {
  const p = run.player;
  const item = p.bag[idx];
  if (!item) return false;
  if (item.type === "weapon") {
    p.bag[idx] = p.weapon;
    p.weapon = item;
    recalc();
    log(item.name + " online.", "good");
    spendGearTurn();
    return true;
  }
  if (item.type === "module") {
    const slot = p.modules.findIndex(c => !c);
    if (slot < 0) return false;         // unequip one first
    p.modules[slot] = item;
    p.bag.splice(idx, 1);
    recalc();
    log(item.name + " installed.", "good");
    spendGearTurn();
    return true;
  }
  return false;
}
function unequipModule(slot) {
  const p = run.player;
  const c = p.modules[slot];
  if (!c || p.bag.length >= BAG_SIZE) return false;
  p.modules[slot] = null;
  p.bag.push(c);
  recalc();
  spendGearTurn();
  return true;
}
function dropItem(idx) {
  const p = run.player;
  if (!p.bag[idx]) return false;
  log(p.bag[idx].name + " jettisoned.", "");
  p.bag.splice(idx, 1);
  return true;
}
function useConsumable(idx, target) {
  const p = run.player;
  const item = p.bag[idx];
  if (!item || item.type !== "consumable" || run.over) return false;
  if (item.kind === "cell") {
    p.st = p.maxSt;
    p.hp = Math.min(p.maxHp, p.hp + 2);
    p.bag.splice(idx, 1);
    log("Power cell spent. Capacitors full.", "good");
    sfx("repair");
    endTurn();
    return true;
  }
  if (item.kind === "dart") {
    if (!target) return false;
    const d = axisDir(p.q, p.r, target.q, target.r);
    if (d < 0 || hexDist(p.q, p.r, target.q, target.r) > 4) return false;
    // fly down the line: rock stops it, the FIRST body catches it
    let q = p.q, r = p.r, victim = null;
    for (let i = 0; i < 4; i++) {
      q += DIRS[d][0]; r += DIRS[d][1];
      const t = run.tiles.get(key(q, r));
      if (!t || t.rock) break;
      victim = run.enemies.find(e => e.q === q && e.r === r);
      if (victim) break;
    }
    if (!victim) return false;
    p.bag.splice(idx, 1);
    sfx("strike");
    hurtEnemy(victim, 4, null);
    if (!run.over) endTurn();
    return true;
  }
  return false;
}

function afterPlayerMove() {
  const p = run.player;
  // pickups
  for (let i = run.shards.length - 1; i >= 0; i--) {
    const s = run.shards[i];
    if (s.q === p.q && s.r === p.r) {
      p.souls += s.souls;
      addFloat(p.q, p.r, "+" + s.souls + " cores", "#7fe0f4");
      sfx("core");
      run.shards.splice(i, 1);
    }
  }
  if (run.bloodstain && run.bloodstain.q === p.q && run.bloodstain.r === p.r) {
    p.souls += run.bloodstain.souls;
    log("You reclaim " + run.bloodstain.souls + " cores from your wreck.", "good");
    addFloat(p.q, p.r, "+" + run.bloodstain.souls + " cores", "#7fe0f4");
    sfx("core");
    run.bloodstain = null;
    const per = persist();
    delete per.stain;
    savePersist(per);
  }
  // chests and dropped loot
  const chest = run.chests.find(c => !c.opened && c.q === p.q && c.r === p.r);
  if (chest) {
    if (giveItem(chest.item)) {
      chest.opened = true;
      log("Cache open: " + chest.item.name + ".", "good");
      addFloat(p.q, p.r, chest.item.name, "#8fe0f0");
      sfx("core");
    } else {
      log("Storage full. Jettison something first.", "warn");
    }
  }
  const li = run.groundLoot.findIndex(l => l.q === p.q && l.r === p.r);
  if (li >= 0) {
    const l = run.groundLoot[li];
    if (giveItem(l.item)) {
      log("Recovered: " + l.item.name + ".", "good");
      addFloat(p.q, p.r, l.item.name, "#8fe0f0");
      sfx("core");
      run.groundLoot.splice(li, 1);
    } else {
      log("Storage full. Jettison something first.", "warn");
    }
  }
  if (run.terminal && !run.terminal.used && run.terminal.q === p.q && run.terminal.r === p.r) {
    showTerminal();
  }
  if (run.stairs && run.stairs.q === p.q && run.stairs.r === p.r) {
    sfx("stairs");
    descend();
  }
}

function hurtEnemy(e, dmg, label) {
  e.hp -= dmg;
  e.flash = 0.25;
  addFloat(e.q, e.r, String(dmg) + (label ? " " + label + "!" : ""), label ? "#f0c060" : "#e8e8ef");
  if (label) log(label === "backstab" ? "Backstab!" : "Riposte!", "good");
  if (e.hp <= 0) {
    const def = ENEMY[e.type];
    let souls = e.elite ? def.souls * 3 : def.souls;
    if (hasModule("salvage")) souls = Math.round(souls * 4 / 3);
    run.player.souls += souls;
    run.kills++;
    if (run.player.weapon.affix === "siphon" && run.player.hp > 0) {
      run.player.hp = Math.min(run.player.maxHp, run.player.hp + 1);
      addFloat(run.player.q, run.player.r, "+1", "#5fe0aa");
    }
    // elites carry loot to the grave
    if (e.elite) run.groundLoot.push({ q: e.q, r: e.r, item: rollLoot(mulberry32((run.seed ^ e.id * 7919) >>> 0), run.floor, true) });
    if (souls) addFloat(e.q, e.r, "+" + souls + " cores", "#7fe0f4");
    burst(hexX(e.q, e.r), hexY(e.q, e.r), def.color, 14, 100);
    burst(hexX(e.q, e.r), hexY(e.q, e.r), "#5fd6f0", 5, 60);
    sfx("die");
    run.enemies.splice(run.enemies.indexOf(e), 1);
    if (e.type === "boss") winRun();
    else log(def.name + " scrapped.", "");
  }
}

function hurtPlayer(e, dmg) {
  const p = run.player;
  // parry: negates a strike from an ADJACENT attacker, staggers it
  if (p.parry && hexDist(p.q, p.r, e.q, e.r) === 1) {
    p.parry = false;
    p.parryHit = true;
    e.stagger = 2;
    e.state = "idle";
    e.windupHexes = [];
    log("DEFLECTED! " + ENEMY[e.type].name + " overloads.", "good");
    addFloat(e.q, e.r, "overloaded", "#f0c060");
    burst(hexX(p.q, p.r), hexY(p.q, p.r), "#7fe6f4", 14, 100);
    sfx("parry");
    return;
  }
  p.hp -= dmg;
  addFloat(p.q, p.r, "-" + dmg, "#e06060");
  hitFlash = 0.3;
  if (dmg >= 5) shake = 7;
  sfx(dmg >= 5 ? "slam" : "hit");
  log(ENEMY[e.type].name + " hits you for " + dmg + ".", "warn");
  if (p.hp <= 0) dieRun();
}

/* enemy phase */
function endTurn() {
  const p = run.player;
  run.turn++;

  // 1. resolve windups that are due
  for (const e of [...run.enemies]) {
    if (e.state !== "windup") continue;
    e.windupTimer--;
    if (e.windupTimer > 0) continue;
    const struck = e.windupHexes.some(k => k === key(p.q, p.r));
    e.state = "idle";
    const hexes = e.windupHexes;
    e.windupHexes = [];
    if (e.type === "boss") resolveBossStrike(e, hexes, struck);
    else {
      if (struck) hurtPlayer(e, e.dmg);
      // rhythm units recover after striking: rail drones recharge, bulwarks
      // re-seat their shield (your window to flank), mortars reload
      if (e.type === "railer" || e.type === "bulwark" || e.type === "mortar") e.rest = 1;
      // stagger 2, not 1: the decision loop below decrements once this same
      // turn, so 2 nets the player exactly one real punish window
      if (e.type === "crusher") { e.stagger = 2; addFloat(e.q, e.r, "overloaded", "#f0c060"); }
    }
    if (run.over) return;
  }
  // parry that outlasted all strikes fizzles (handled in actParry log)
  p.parry = false;

  // 2. everyone else decides
  const flow = bfsDist(key(p.q, p.r));
  for (const e of run.enemies) {
    if (e.state === "windup") continue;
    if (e.stagger > 0) { e.stagger--; continue; }
    aiAct(e, flow);
    if (run.over) return;
  }

  updateFov();
  centerCam();
  refreshHud();
}

function stepEnemyToward(e, flow) {
  let best = null, bd = flow.get(key(e.q, e.r));
  if (bd === undefined) bd = Infinity;
  for (const [dq, dr] of DIRS) {
    const nk = key(e.q + dq, e.r + dr);
    const d = flow.get(nk);
    if (d === undefined || d >= bd) continue;
    if (occupied(e.q + dq, e.r + dr)) continue;
    bd = d; best = [dq, dr];
  }
  if (best) {
    e.dir = DIRS.findIndex(([q, r]) => q === best[0] && r === best[1]);
    e.q += best[0]; e.r += best[1];
    return true;
  }
  return false;
}
function stepEnemyAway(e, flow) {
  let best = null, bd = flow.get(key(e.q, e.r)) ?? 0;
  for (const [dq, dr] of DIRS) {
    const nk = key(e.q + dq, e.r + dr);
    const d = flow.get(nk);
    if (d === undefined || d <= bd) continue;
    if (occupied(e.q + dq, e.r + dr)) continue;
    bd = d; best = [dq, dr];
  }
  if (best) { e.q += best[0]; e.r += best[1]; return true; }
  return false;
}
function faceToward(e, q, r) {
  const d = DIRS.findIndex(([dq, dr]) => e.q + dq === q && e.r + dr === r);
  if (d >= 0) e.dir = d;
}

function aiAct(e, flow) {
  const p = run.player;
  const dist = hexDist(e.q, e.r, p.q, p.r);
  const def = ENEMY[e.type];
  // dormant until the player has been seen once
  if (!e.awake) {
    if (dist <= FOV_R && losClear(e.q, e.r, p.q, p.r)) e.awake = true;
    else return;
  }
  switch (e.type) {
    case "scrapper":
      if (dist === 1) {
        faceToward(e, p.q, p.r);
        e.state = "windup";
        e.windupTimer = def.windup;
        e.windupHexes = [key(p.q, p.r)];
      } else stepEnemyToward(e, flow);
      break;
    case "bulwark":
      if (e.rest > 0) { e.rest--; break; }
      if (dist === 1) {
        faceToward(e, p.q, p.r);   // facing locks for the swing — flank now
        e.state = "windup";
        e.windupTimer = def.windup;
        e.windupHexes = [key(p.q, p.r)];
      } else {
        stepEnemyToward(e, flow);
        faceToward(e, p.q, p.r);   // shield tracks you while it advances
      }
      break;
    case "mortar": {
      if (e.rest > 0) { e.rest--; break; }
      if (dist <= 1) { stepEnemyAway(e, flow); break; }
      if (dist >= 2 && dist <= 5) {
        // lob a bomb at your current hex — a 7-hex blast, two turns out.
        // It arcs over rock: cover is no shelter from a Bellows.
        faceToward(e, p.q, p.r);
        const hexes = [key(p.q, p.r)];
        for (const [dq, dr] of DIRS) {
          const t = run.tiles.get(key(p.q + dq, p.r + dr));
          if (t && !t.rock) hexes.push(key(p.q + dq, p.r + dr));
        }
        e.state = "windup";
        e.windupTimer = def.windup;
        e.windupHexes = hexes;
      } else stepEnemyToward(e, flow);
      break;
    }
    case "ripper": {
      if (dist === 1) {
        faceToward(e, p.q, p.r);
        e.state = "windup";
        e.windupTimer = def.windup;
        e.windupHexes = [key(p.q, p.r)];
      } else {
        stepEnemyToward(e, flow);
        if (hexDist(e.q, e.r, p.q, p.r) > 1) stepEnemyToward(e, flow);
      }
      break;
    }
    case "railer": {
      if (e.rest > 0) { e.rest--; break; }
      // flee only when adjacent: a kiting range-2 drone can never be
      // caught on foot (equal speeds), which soft-locks melee play
      if (dist <= 1) { stepEnemyAway(e, flow); break; }
      const d = axisDir(e.q, e.r, p.q, p.r);
      const clearShot = d >= 0 && losClear(e.q, e.r, p.q, p.r);
      if (!clearShot && dist <= def.range) {
        // no CLEAR firing lane (unaligned, or the axis runs through rock):
        // maneuver into one instead of mirror-chasing around obstacles forever
        for (const [dq, dr] of DIRS) {
          const nq = e.q + dq, nr = e.r + dr;
          if (!walkable(nq, nr) || occupied(nq, nr)) continue;
          if (hexDist(nq, nr, p.q, p.r) >= 2 && axisDir(nq, nr, p.q, p.r) >= 0 &&
              losClear(nq, nr, p.q, p.r)) {
            e.q = nq; e.r = nr;
            e.dir = DIRS.findIndex(([a, b]) => a === dq && b === dr);
            return;
          }
        }
      }
      if (clearShot && dist <= def.range) {
        // mark the whole flight line: stepping off it dodges; anything on
        // it (allies included) eats the arrow
        e.dir = d;
        const hexes = [];
        let q = e.q, r = e.r;
        for (let i = 0; i < def.range; i++) {
          q += DIRS[d][0]; r += DIRS[d][1];
          const t = run.tiles.get(key(q, r));
          if (!t || t.rock) break;
          hexes.push(key(q, r));
        }
        e.state = "windup";
        e.windupTimer = def.windup;
        e.windupHexes = hexes;
      } else stepEnemyToward(e, flow);
      break;
    }
    case "crusher": {
      if (dist === 1) {
        faceToward(e, p.q, p.r);
        e.state = "windup";
        e.windupTimer = def.windup;
        e.windupHexes = DIRS.map(([dq, dr]) => key(e.q + dq, e.r + dr));
      } else {
        e.moveToggle = !e.moveToggle;      // slow: moves every other turn
        if (e.moveToggle) stepEnemyToward(e, flow);
      }
      break;
    }
    case "boss": bossAct(e, flow, dist); break;
  }
}

/* boss: scripted, learnable cycle. After every 3rd attack he rests. */
function bossAct(e, flow, dist) {
  const p = run.player;
  if (e.bossCount >= 3) {
    e.bossCount = 0;
    e.stagger = 1;
    log("The OVERSEER vents heat.", "good");
    addFloat(e.q, e.r, "overheated", "#f0c060");
    return;
  }
  if (!e.bossPhase2 && e.hp <= e.maxHp / 2) {
    e.bossPhase2 = true;
    // ring slam + summons, telegraphed 2 turns
    e.state = "windup";
    e.windupTimer = 2;
    e.windupKind = "slam";
    e.windupHexes = DIRS.map(([dq, dr]) => key(e.q + dq, e.r + dr));
    log("The OVERSEER floods its core...", "warn");
    return;
  }
  if (dist === 1) {
    // cleave: the player's hex and its two neighbors around the King
    faceToward(e, p.q, p.r);
    const d = e.dir;
    e.state = "windup";
    e.windupTimer = 1;
    e.windupKind = "cleave";
    e.windupHexes = [d, (d + 1) % 6, (d + 5) % 6]
      .map(i => key(e.q + DIRS[i][0], e.r + DIRS[i][1]));
    e.bossCount++;
    return;
  }
  const d = axisDir(e.q, e.r, p.q, p.r);
  if (d >= 0 && dist <= 5 && losClear(e.q, e.r, p.q, p.r)) {
    // charge down the line
    e.dir = d;
    const hexes = [];
    let q = e.q, r = e.r;
    for (let i = 0; i < 5; i++) {
      q += DIRS[d][0]; r += DIRS[d][1];
      const t = run.tiles.get(key(q, r));
      if (!t || t.rock) break;
      hexes.push(key(q, r));
    }
    e.state = "windup";
    e.windupTimer = 1;
    e.windupKind = "charge";
    e.windupHexes = hexes;
    e.bossCount++;
    return;
  }
  stepEnemyToward(e, flow);
}

function resolveBossStrike(e, hexes, struck) {
  const p = run.player;
  if (e.windupKind === "charge") {
    // dash to the last unoccupied hex of the line
    let landing = null;
    for (const k of hexes) {
      const [q, r] = unkey(k);
      if (!occupied(q, r)) landing = [q, r];
      if (q === p.q && r === p.r) break;
    }
    if (struck) hurtPlayer(e, 4);
    if (landing) { e.q = landing[0]; e.r = landing[1]; }
  } else if (e.windupKind === "slam") {
    if (struck) hurtPlayer(e, 6);
    // fabricate two scrappers
    const free = [];
    for (const [dq, dr] of DIRS) {
      const q = e.q + dq * 2, r = e.r + dr * 2;
      if (walkable(q, r) && !occupied(q, r)) free.push([q, r]);
    }
    const summons = ["scrapper", "bulwark"];
    for (let i = 0; i < 2 && free.length; i++) {
      const [q, r] = free.splice((i * 3) % free.length, 1)[0];
      const h = spawnEnemy(summons[i] || "scrapper", q, r);
      h.awake = true;
    }
    e.stagger = 2;   // resolved pre-decrement this turn; nets one window
    log("Fabricators spit out fresh units!", "warn");
  } else {
    if (struck) hurtPlayer(e, 5);
  }
}

/* ------------------------------------------------------------ end states */
function dieRun() {
  const p = run.player;
  p.dead = true;
  run.over = true;
  sfx("shutdown");
  const per = persist();
  per.deaths = (per.deaths || 0) + 1;
  per.best = Math.max(per.best || 0, run.floor);
  if (p.souls > 0) per.stain = { floor: run.floor, souls: p.souls };
  savePersist(per);
  document.getElementById("death-souls").textContent =
    p.souls > 0 ? p.souls + " cores scattered in Sector " + run.floor + " — reclaim them from your wreck."
                : "You carried nothing worth salvaging.";
  document.getElementById("death-stats").textContent =
    "Sector " + run.floor + " · " + run.kills + " scrapped · cycle " + run.turn;
  document.getElementById("death").classList.remove("hidden");
}

function winRun() {
  run.over = true;
  run.won = true;
  sfx("win");
  const per = persist();
  per.wins = (per.wins || 0) + 1;
  per.best = 5;
  delete per.stain;
  savePersist(per);
  document.getElementById("win-stats").textContent =
    run.kills + " scrapped · " + run.turn + " cycles · " + run.player.souls + " cores unspent";
  document.getElementById("win").classList.remove("hidden");
}

/* ================================ SOUND ================================= */
// A tiny synth: every effect is an oscillator or noise burst with an
// envelope. No assets, no loading, mute persisted.
let audioCtx = null;
let muted = !!persist().muted;
function ac() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur, type, gain, slideTo) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}
function noiseBurst(dur, gain, filterFreq) {
  const c = ac();
  if (!c) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}
function sfx(name) {
  if (muted) return;
  try {
    switch (name) {
      // servo-driven strike: a short mechanical zap with a metal transient
      case "strike":  tone(280, 0.08, "sawtooth", 0.16, 170); noiseBurst(0.05, 0.12, 3400); break;
      case "hit":     tone(110, 0.14, "square", 0.2, 62); noiseBurst(0.07, 0.14, 1800); break;
      case "slam":    tone(58, 0.34, "square", 0.3, 32); noiseBurst(0.26, 0.24, 620); break;
      // shield field rejecting a hit: high electronic ping
      case "block":   tone(1320, 0.07, "square", 0.13, 900); tone(660, 0.12, "sine", 0.1, 520); break;
      // deflector overload: bright rising chirp
      case "parry":   tone(900, 0.05, "square", 0.14, 1500);
                      setTimeout(() => tone(1500, 0.17, "sine", 0.2, 2300), 45); break;
      case "dash":    noiseBurst(0.18, 0.14, 1600); tone(420, 0.16, "sine", 0.08, 900); break;
      // a machine losing power: descending saw + debris
      case "die":     tone(220, 0.3, "sawtooth", 0.17, 48); noiseBurst(0.16, 0.14, 1200); break;
      case "shutdown":tone(240, 1.9, "sawtooth", 0.26, 28); noiseBurst(0.5, 0.1, 500); break;
      // nanite injection: rising hiss
      case "repair":  noiseBurst(0.14, 0.07, 2600);
                      tone(420, 0.1, "sine", 0.14, 560);
                      setTimeout(() => tone(620, 0.12, "sine", 0.13, 800), 95); break;
      case "core":    tone(1050, 0.09, "square", 0.09, 1400);
                      setTimeout(() => tone(1560, 0.12, "sine", 0.09), 70); break;
      case "stairs":  tone(340, 0.5, "triangle", 0.13, 120); noiseBurst(0.3, 0.06, 700); break;
      case "win":     [523, 659, 784, 1047].forEach((f, i) =>
                        setTimeout(() => tone(f, 0.38, "triangle", 0.16), i * 140)); break;
    }
  } catch (e) { /* audio can fail freely */ }
}

/* =============================== RENDERING ============================== */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;
const cam = { x: 0, y: 0, zoom: 1 };
let hitFlash = 0;
let shake = 0;
const floats = [];
const particles = [];
function addFloat(q, r, text, color) {
  floats.push({ x: hexX(q, r), y: hexY(q, r) - HEX * 0.4, text, color, life: 1.1 });
}
function burst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.6);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.3 + Math.random() * 0.35, max: 0.6, color,
      size: 1.5 + Math.random() * 2.5,
    });
  }
}

function resize() {
  DPR = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  cam.zoom = clamp(Math.min(W, H) / (HEX * 24), 0.55, 2.2);
}
window.addEventListener("resize", resize);
resize();

function centerCam() {
  cam.tx = hexX(run.player.q, run.player.r);
  cam.ty = hexY(run.player.q, run.player.r);
}

const FLOOR_COLOR = "#2b3540";
let terrainCache = null, fogCache = null, fogDirty = true;
function invalidateFloorCaches() { terrainCache = null; fogCache = null; fogDirty = true; }

function cacheSpan() {
  const R = FLOORS[run.floor - 1].R;
  return (R + 1.5) * SQ3 * HEX;
}
function buildTerrainCache() {
  const S = 2, span = cacheSpan();
  const tc = document.createElement("canvas");
  tc.width = tc.height = Math.ceil(span * 2 * S);
  const c = tc.getContext("2d");
  c.setTransform(S, 0, 0, S, span * S, span * S);
  for (const t of run.tiles.values()) {
    const x = hexX(t.q, t.r), y = hexY(t.q, t.r);
    hexPath(c, x, y, 1.02);
    if (t.rock) {
      c.fillStyle = shade("#131b23", t.shade);
      c.fill();
      hexPath(c, x, y, 0.72);
      c.fillStyle = shade("#3b4c5c", t.shade);
      c.fill();
    } else {
      c.fillStyle = shade(FLOOR_COLOR, t.shade);
      c.fill();
      hexPath(c, x, y);
      c.strokeStyle = "#0a121a55";
      c.lineWidth = 1;
      c.stroke();
    }
  }
  terrainCache = { canvas: tc, span };
}
function buildFogCache() {
  const S = 2, span = cacheSpan();
  if (!fogCache) {
    const fc = document.createElement("canvas");
    fc.width = fc.height = Math.ceil(span * 2 * S);
    fogCache = { canvas: fc, span };
  }
  const c = fogCache.canvas.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, fogCache.canvas.width, fogCache.canvas.height);
  c.setTransform(S, 0, 0, S, span * S, span * S);
  for (const t of run.tiles.values()) {
    const k = key(t.q, t.r);
    if (visible.has(k)) continue;
    hexPath(c, hexX(t.q, t.r), hexY(t.q, t.r), 1.04);
    c.fillStyle = t.explored ? "#080d1299" : "#080d12";
    c.fill();
  }
  fogDirty = false;
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) + amt * 255, g = ((n >> 8) & 255) + amt * 255, b = (n & 255) + amt * 255;
  return `rgb(${clamp(r | 0, 0, 255)},${clamp(g | 0, 0, 255)},${clamp(b | 0, 0, 255)})`;
}

let lastFrame = performance.now();
function render(now) {
  now = now || performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  // camera glide
  if (cam.tx !== undefined) {
    cam.x = lerp(cam.x, cam.tx, 1 - Math.pow(0.001, dt));
    cam.y = lerp(cam.y, cam.ty, 1 - Math.pow(0.001, dt));
  }
  hitFlash = Math.max(0, hitFlash - dt);
  shake = Math.max(0, shake - dt * 26);
  const shx = shake ? (Math.random() - 0.5) * shake : 0;
  const shy = shake ? (Math.random() - 0.5) * shake : 0;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#0c1015";
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(cam.zoom * DPR, 0, 0, cam.zoom * DPR,
    (W / 2 - (cam.x + shx) * cam.zoom) * DPR, (H / 2 - (cam.y + shy) * cam.zoom) * DPR);

  if (!terrainCache) buildTerrainCache();
  ctx.drawImage(terrainCache.canvas, -terrainCache.span, -terrainCache.span,
    terrainCache.span * 2, terrainCache.span * 2);

  const t = now / 1000;

  /* drop shaft, repair bay, cores, wreck */
  if (run.stairs && visibleOrExplored(run.stairs)) drawStairs(run.stairs);
  if (run.bay && visibleOrExplored(run.bay)) drawRepairBay(run.bay, t);
  if (run.terminal && visibleOrExplored(run.terminal)) drawTerminal(run.terminal, t);
  for (const c of run.chests) if (visibleOrExplored(c)) drawChest(c, t);
  for (const l of run.groundLoot) if (visible.has(key(l.q, l.r))) drawLootDrop(l, t);
  for (const s of run.shards) if (visible.has(key(s.q, s.r))) drawShard(s, t);
  if (run.bloodstain && visible.has(key(run.bloodstain.q, run.bloodstain.r)))
    drawStain(run.bloodstain, t);

  /* telegraphs */
  const pulse = 0.5 + 0.3 * Math.sin(t * 6);
  for (const e of run.enemies) {
    if (e.state !== "windup") continue;
    for (const k of e.windupHexes) {
      if (!visible.has(k)) continue;
      const [q, r] = unkey(k);
      hexPath(ctx, hexX(q, r), hexY(q, r), 0.92);
      ctx.fillStyle = `rgba(200,60,50,${(e.windupTimer > 1 ? 0.18 : 0.34) * (0.7 + pulse * 0.4)})`;
      ctx.fill();
      hexPath(ctx, hexX(q, r), hexY(q, r), 0.92);
      ctx.strokeStyle = `rgba(230,90,70,${e.windupTimer > 1 ? 0.5 : 0.9})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /* shock-dart targets: first machine down each clear lane */
  if (ui.throwItem) {
    for (let d = 0; d < 6; d++) {
      let q = run.player.q, r = run.player.r;
      for (let i = 0; i < 4; i++) {
        q += DIRS[d][0]; r += DIRS[d][1];
        const tl = run.tiles.get(key(q, r));
        if (!tl || tl.rock) break;
        const e = run.enemies.find(o => o.q === q && o.r === r);
        if (e) {
          if (visible.has(key(q, r))) {
            hexPath(ctx, hexX(q, r), hexY(q, r), 0.75);
            ctx.strokeStyle = "#5fe0f0";
            ctx.lineWidth = 2.5;
            ctx.stroke();
          }
          break;
        }
      }
    }
  }

  /* dash targets */
  if (ui.rollMode && run.player.st >= run.player.rollCost) {
    for (const [dq, dr] of DIRS) {
      const q = run.player.q + dq * 2, r = run.player.r + dr * 2;
      const mq = run.player.q + dq, mr = run.player.r + dr;
      const mt = run.tiles.get(key(mq, mr));
      if (!mt || mt.rock || !walkable(q, r) || occupied(q, r)) continue;
      hexPath(ctx, hexX(q, r), hexY(q, r), 0.7);
      ctx.strokeStyle = "#4fd6e8";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  /* enemies */
  for (const e of run.enemies) {
    if (!visible.has(key(e.q, e.r))) continue;
    drawEnemy(e, t, dt);
  }
  /* player */
  drawPlayer(run.player, t);

  /* fog */
  if (fogDirty) buildFogCache();
  ctx.drawImage(fogCache.canvas, -fogCache.span, -fogCache.span,
    fogCache.span * 2, fogCache.span * 2);

  /* particles */
  for (let i = particles.length - 1; i >= 0; i--) {
    const pa = particles[i];
    pa.life -= dt;
    if (pa.life <= 0) { particles.splice(i, 1); continue; }
    pa.x += pa.vx * dt; pa.y += pa.vy * dt;
    pa.vx *= 0.9; pa.vy *= 0.9;
    ctx.globalAlpha = clamp(pa.life / pa.max, 0, 1);
    ctx.fillStyle = pa.color;
    ctx.beginPath();
    ctx.arc(pa.x, pa.y, pa.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* floats */
  ctx.textAlign = "center";
  ctx.font = "bold 13px sans-serif";
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.life -= dt;
    f.y -= dt * 22;
    if (f.life <= 0) { floats.splice(i, 1); continue; }
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  /* hit vignette */
  if (hitFlash > 0) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = `rgba(180,30,30,${hitFlash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(render);
}

function visibleOrExplored(o) {
  const t = run.tiles.get(key(o.q, o.r));
  return t && (visible.has(key(o.q, o.r)) || t.explored);
}

/* entity drawing — entities glide toward their logical hex */
function entityPos(e) {
  const tx = hexX(e.q, e.r), ty = hexY(e.q, e.r);
  if (e.px === undefined) { e.px = tx; e.py = ty; }
  e.px = lerp(e.px, tx, 0.25);
  e.py = lerp(e.py, ty, 0.25);
  return { x: e.px, y: e.py };
}
function drawPlayer(p, t) {
  const pos = entityPos(p);
  // attack lunge nudge, decaying
  p.bumpX = (p.bumpX || 0) * 0.82;
  p.bumpY = (p.bumpY || 0) * 0.82;
  pos.x += p.bumpX;
  pos.y += p.bumpY;
  // chassis
  hexPath(ctx, pos.x, pos.y, 0.62);
  ctx.fillStyle = "#b6c6d2";
  ctx.fill();
  hexPath(ctx, pos.x, pos.y, 0.62);
  ctx.strokeStyle = "#6d8494";
  ctx.lineWidth = 2;
  ctx.stroke();
  // plating seam
  ctx.strokeStyle = "#8ea2b0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pos.x - 9, pos.y + 5);
  ctx.lineTo(pos.x + 9, pos.y + 5);
  ctx.stroke();
  // optic bar
  ctx.fillStyle = "#0f1c24";
  ctx.fillRect(pos.x - 9, pos.y - 5, 18, 6);
  ctx.fillStyle = "#4fd6e8";
  ctx.fillRect(pos.x - 7, pos.y - 4, 14, 3);
  // power indicator: dims as the capacitor drains
  const lit = p.maxSt ? clamp(p.st / p.maxSt, 0, 1) : 0;
  ctx.fillStyle = `rgba(79,214,232,${0.25 + lit * 0.75})`;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - HEX * 0.55, 3.5, 0, TAU);
  ctx.fill();
  if (p.parry) {
    // deflector field
    hexPath(ctx, pos.x, pos.y, 0.9);
    ctx.strokeStyle = "#7fe6f4";
    ctx.lineWidth = 3;
    ctx.stroke();
    hexPath(ctx, pos.x, pos.y, 0.78);
    ctx.strokeStyle = "rgba(127,230,244,0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
function drawEnemy(e, t, dt) {
  const pos = entityPos(e);
  const def = ENEMY[e.type];
  e.flash = Math.max(0, (e.flash || 0) - dt);
  const big = e.type === "boss" ? 1.0 : e.type === "crusher" ? 0.78 : 0.55;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  // facing wedge
  const fv = [Math.cos((e.dir * 60 - 0) * Math.PI / 180), 0];
  const ang = Math.atan2(hexY(...DIRS[e.dir]) , hexX(...DIRS[e.dir]));
  ctx.rotate(ang);
  ctx.fillStyle = e.flash > 0 ? "#ffffff" : (e.elite ? shade(def.color, 0.18) : def.color);
  ctx.beginPath();
  ctx.moveTo(HEX * big, 0);
  ctx.lineTo(-HEX * big * 0.65, HEX * big * 0.7);
  ctx.lineTo(-HEX * big * 0.3, 0);
  ctx.lineTo(-HEX * big * 0.65, -HEX * big * 0.7);
  ctx.closePath();
  ctx.fill();
  // chassis edge — everything down here is welded metal
  ctx.strokeStyle = e.elite ? "#f0d060" : "#0f1720";
  ctx.lineWidth = e.elite ? 2 : 1.2;
  ctx.stroke();
  // hostile optic
  ctx.fillStyle = e.type === "boss" ? "#ffe07a" : "#ff6a52";
  ctx.beginPath();
  ctx.arc(HEX * big * 0.3, 0, HEX * big * 0.16, 0, TAU);
  ctx.fill();
  // bulwark: the shield IS the tell — an emitter bar across its front arc
  if (e.type === "bulwark") {
    ctx.strokeStyle = e.stagger > 0 ? "#55606e" : "#c8d8e8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, HEX * big * 1.05, -1.15, 1.15);
    ctx.stroke();
  }
  // mortar: the charge it's about to lob
  if (e.type === "mortar") {
    ctx.fillStyle = e.state === "windup" ? "#e06040" : "#3a3230";
    ctx.beginPath();
    ctx.arc(-HEX * big * 0.35, 0, HEX * big * 0.34, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  if (e.type === "boss") {
    // crown
    ctx.fillStyle = "#ffe07a";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("◈", pos.x, pos.y - HEX * 0.9);
  }
  // state markers
  if (e.state === "windup") {
    ctx.fillStyle = e.windupTimer > 1 ? "#e0a050" : "#e06050";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(e.windupTimer > 1 ? "!" : "!!", pos.x, pos.y - HEX * (big + 0.35));
  } else if (e.stagger > 0) {
    ctx.fillStyle = "#f0d060";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✶", pos.x, pos.y - HEX * (big + 0.35));
  }
  // hp pips
  if (e.hp < e.maxHp) {
    const w = HEX * 1.1;
    ctx.fillStyle = "#000000aa";
    ctx.fillRect(pos.x - w / 2, pos.y + HEX * big * 0.8 + 3, w, 3.5);
    ctx.fillStyle = "#e06060";
    ctx.fillRect(pos.x - w / 2, pos.y + HEX * big * 0.8 + 3, w * clamp(e.hp / e.maxHp, 0, 1), 3.5);
  }
}
/* drop shaft to the next sector: an open floor hatch, lit from below */
function drawStairs(s) {
  const x = hexX(s.q, s.r), y = hexY(s.q, s.r);
  hexPath(ctx, x, y, 0.82);
  ctx.fillStyle = "#070c11";
  ctx.fill();
  ctx.strokeStyle = "#3f6f82";
  ctx.lineWidth = 2;
  hexPath(ctx, x, y, 0.82);
  ctx.stroke();
  // descending chevrons
  ctx.strokeStyle = "#4fd6e8";
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    const oy = -8 + i * 8;
    ctx.globalAlpha = 0.35 + i * 0.25;
    ctx.beginPath();
    ctx.moveTo(x - 7, y + oy);
    ctx.lineTo(x, y + oy + 5);
    ctx.lineTo(x + 7, y + oy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
/* repair bay: a docking pylon; live bays hum with a coolant glow */
function drawRepairBay(b, t) {
  const x = hexX(b.q, b.r), y = hexY(b.q, b.r);
  if (!b.used) {
    const fl = 0.85 + 0.15 * Math.sin(t * 5);
    const grad = ctx.createRadialGradient(x, y, 2, x, y, 24 * fl);
    grad.addColorStop(0, "rgba(80,230,190,0.5)");
    grad.addColorStop(1, "rgba(60,200,160,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 24 * fl, 0, TAU);
    ctx.fill();
  }
  // pylon
  ctx.fillStyle = b.used ? "#3a444e" : "#6d8494";
  ctx.fillRect(x - 3, y - 14, 6, 22);
  ctx.fillStyle = b.used ? "#2e3740" : "#4a5c6a";
  ctx.fillRect(x - 10, y + 6, 20, 5);
  // cross-brace: the universal "repair" read
  ctx.strokeStyle = b.used ? "#4a5560" : "#5fe0b8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 6);
  ctx.lineTo(x + 8, y - 6);
  ctx.stroke();
}
/* loose core fragment */
function drawShard(s, t) {
  const x = hexX(s.q, s.r), y = hexY(s.q, s.r) + Math.sin(t * 3 + s.q) * 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 1.5 + s.q);
  ctx.fillStyle = "#5fd6f0";
  ctx.globalAlpha = 0.9;
  ctx.fillRect(-3.5, -3.5, 7, 7);
  ctx.strokeStyle = "#b0f4ff";
  ctx.lineWidth = 1;
  ctx.strokeRect(-3.5, -3.5, 7, 7);
  ctx.restore();
  ctx.globalAlpha = 1;
}
/* corrupted terminal: a screen still running something it should not */
function drawTerminal(s, t) {
  const x = hexX(s.q, s.r), y = hexY(s.q, s.r);
  const live = !s.used;
  if (live) {
    const glow = 0.5 + 0.3 * Math.sin(t * 3);
    const grad = ctx.createRadialGradient(x, y, 2, x, y, 22);
    grad.addColorStop(0, `rgba(224,112,200,${glow * 0.5})`);
    grad.addColorStop(1, "rgba(224,112,200,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = live ? "#3d2a44" : "#2e3740";
  ctx.fillRect(x - 9, y - 12, 18, 20);
  ctx.strokeStyle = live ? "#e070c8" : "#4a5560";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 9, y - 12, 18, 20);
  if (live) {
    // glitching scanlines
    ctx.fillStyle = "#e070c8";
    for (let i = 0; i < 4; i++) {
      const w = 4 + ((Math.sin(t * 9 + i * 2.1) + 1) * 5);
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 7 + i);
      ctx.fillRect(x - 6, y - 8 + i * 4, w, 2);
    }
    ctx.globalAlpha = 1;
  }
}
/* supply cache */
function drawChest(c, t) {
  const x = hexX(c.q, c.r), y = hexY(c.q, c.r);
  if (!c.opened) {
    const glow = 0.4 + 0.2 * Math.sin(t * 4 + c.q);
    const grad = ctx.createRadialGradient(x, y, 2, x, y, 17);
    grad.addColorStop(0, `rgba(90,220,240,${glow})`);
    grad.addColorStop(1, "rgba(90,220,240,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = c.opened ? "#333c45" : "#4f636f";
  ctx.fillRect(x - 10, y - 7, 20, 14);
  ctx.strokeStyle = c.opened ? "#2a323a" : "#7695a5";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 10, y - 7, 20, 14);
  // status lamp
  ctx.fillStyle = c.opened ? "#3f4a54" : "#5fe0f0";
  ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
}
/* a dropped part, glinting */
function drawLootDrop(l, t) {
  const x = hexX(l.q, l.r), y = hexY(l.q, l.r) + Math.sin(t * 3 + l.q) * 1.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.7);
  ctx.fillStyle = "#8fe0f0";
  ctx.fillRect(-2, -8, 4, 16);
  ctx.fillStyle = "#cff6ff";
  ctx.fillRect(-2, -8, 4, 4);
  ctx.restore();
}
/* your previous frame, still leaking cores */
function drawStain(b, t) {
  const x = hexX(b.q, b.r), y = hexY(b.q, b.r);
  const pulse = 0.5 + 0.3 * Math.sin(t * 4);
  const grad = ctx.createRadialGradient(x, y, 1, x, y, 15);
  grad.addColorStop(0, `rgba(95,214,240,${pulse * 0.7})`);
  grad.addColorStop(1, "rgba(95,214,240,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, TAU);
  ctx.fill();
  // broken chassis
  ctx.strokeStyle = `rgba(180,235,250,${0.5 + 0.3 * pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 7, y + 4); ctx.lineTo(x + 2, y - 2); ctx.lineTo(x + 7, y + 5);
  ctx.moveTo(x - 3, y - 6); ctx.lineTo(x + 4, y + 6);
  ctx.stroke();
}

/* ================================= UI =================================== */
const ui = { rollMode: false, throwItem: null, walking: null, keys: {} };

function refreshHud() {
  const p = run.player;
  document.getElementById("hp-fill").style.width = clamp(p.hp / p.maxHp, 0, 1) * 100 + "%";
  document.getElementById("hp-text").textContent = Math.max(p.hp, 0) + "/" + p.maxHp;
  const st = document.getElementById("stamina");
  st.innerHTML = "";
  for (let i = 0; i < p.maxSt; i++) {
    const d = document.createElement("div");
    d.className = "pip" + (i < p.st ? " on" : "");
    st.appendChild(d);
  }
  const fl = document.getElementById("flasks");
  fl.innerHTML = "";
  for (let i = 0; i < p.maxFlask; i++) {
    const d = document.createElement("div");
    d.className = "flask" + (i < p.flask ? " on" : "");
    fl.appendChild(d);
  }
  document.getElementById("souls").textContent = p.souls;
  document.getElementById("floor-num").textContent = run.floor;
  document.getElementById("weapon-name").textContent = p.weapon.name;
  document.getElementById("btn-bag").textContent = "Cargo " + p.bag.length + "/" + BAG_SIZE;

  const rollBtn = document.getElementById("btn-roll");
  rollBtn.textContent = p.rollCost === 2 ? "Dash" : `Dash (${p.rollCost})`;
  rollBtn.classList.toggle("active", ui.rollMode);
  rollBtn.disabled = p.st < p.rollCost || run.over;
  document.getElementById("btn-parry").disabled = p.st < p.parryCost || run.over;
  document.getElementById("btn-flask").disabled = p.flask <= 0 || p.hp >= p.maxHp || run.over;
  const b = run.bay;
  document.getElementById("btn-rest").classList.toggle("hidden",
    !b || b.used || hexDist(p.q, p.r, b.q, b.r) > 1 || run.over);
}

function renderLog() {
  const el = document.getElementById("log");
  el.innerHTML = run.log.slice(-4).map(l =>
    `<div class="${l.cls}">${l.msg}</div>`).join("");
}

/* ------- repair bay fabrication ------- */
let bought = {};
function showShop() {
  const p = run.player;
  const box = document.getElementById("shop-items");
  box.innerHTML = "";
  for (const u of UPGRADES) {
    const n = bought[u.id] || 0;
    const cost = Math.round(u.base * Math.pow(1.5, n));
    const el = document.createElement("button");
    el.className = "shop-item";
    el.disabled = p.souls < cost;
    el.innerHTML = `<b>${u.name}</b><span>${u.desc}</span><em>${cost} cores</em>`;
    el.addEventListener("click", () => {
      if (p.souls < cost) return;
      p.souls -= cost;
      bought[u.id] = n + 1;
      u.apply(p);
      recalc();
      log(u.name + " installed.", "good");
      showShop();
      refreshHud();
    });
    box.appendChild(el);
  }
  document.getElementById("shop").classList.remove("hidden");
}
document.getElementById("shop-close").addEventListener("click", () => {
  document.getElementById("shop").classList.add("hidden");
  refreshHud();
});

/* ------- corrupted terminal: install a protocol ------- */
function showTerminal() {
  const p = run.player;
  const rng = mulberry32((run.seed ^ (run.floor * 104729)) >>> 0);
  const eligible = PACTS.filter(pa => pa.can(p));
  // seeded pick of two offers
  const offers = [];
  const pool = [...eligible];
  while (offers.length < 2 && pool.length) offers.push(pool.splice((rng() * pool.length) | 0, 1)[0]);
  const box = document.getElementById("terminal-items");
  box.innerHTML = "";
  for (const pa of offers) {
    const el = document.createElement("button");
    el.className = "shop-item";
    el.innerHTML = `<b>${pa.name}</b><span>${pa.desc}</span>`;
    el.addEventListener("click", () => {
      pa.apply(p);
      recalc();
      run.terminal.used = true;
      log("Terminal accepts. " + pa.name + " installed.", "sys");
      sfx("core");
      document.getElementById("terminal").classList.add("hidden");
      refreshHud();
    });
    box.appendChild(el);
  }
  document.getElementById("terminal").classList.remove("hidden");
}
document.getElementById("terminal-leave").addEventListener("click", () => {
  document.getElementById("terminal").classList.add("hidden");
  log("You leave the terminal alone.", "");
});

/* ------- inventory panel ------- */
function invOpen() { return !document.getElementById("inv").classList.contains("hidden"); }
function openInv() { refreshInv(); refreshHud(); document.getElementById("inv").classList.remove("hidden"); }
function closeInv() { document.getElementById("inv").classList.add("hidden"); }
function itemCard(item, buttons) {
  const el = document.createElement("div");
  el.className = "item-card";
  el.innerHTML = `<div class="item-info"><b>${item.name}</b><span>${item.desc}</span></div>`;
  const btns = document.createElement("div");
  btns.className = "item-btns";
  for (const [label, fn, disabled] of buttons) {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = !!disabled;
    b.addEventListener("click", fn);
    btns.appendChild(b);
  }
  el.appendChild(btns);
  return el;
}
function refreshInv() {
  const p = run.player;
  document.getElementById("inv-note").textContent = inCombat()
    ? "⚠ Hostiles in sensor range — swapping hardware will cost your turn."
    : "No contacts. Hardware swaps are free.";
  const eq = document.getElementById("inv-equipped");
  eq.innerHTML = "";
  eq.appendChild(itemCard(p.weapon, []));
  eq.lastChild.classList.add("equipped");
  p.modules.forEach((c, slot) => {
    if (c) {
      const card = itemCard(c, [["Unequip", () => {
        if (unequipModule(slot)) { refreshInv(); refreshHud(); }
      }, p.bag.length >= BAG_SIZE]]);
      card.classList.add("equipped");
      eq.appendChild(card);
    } else {
      const empty = document.createElement("div");
      empty.className = "item-card empty-slot";
      empty.textContent = "empty module slot";
      eq.appendChild(empty);
    }
  });
  const bagEl = document.getElementById("inv-bag");
  bagEl.innerHTML = "";
  if (!p.bag.length) {
    bagEl.innerHTML = "<div class='empty-slot item-card'>your bag is empty</div>";
  }
  p.bag.forEach((item, idx) => {
    const buttons = [];
    if (item.type === "weapon") {
      buttons.push(["Equip", () => { equipItem(idx); refreshInv(); refreshHud(); }]);
    } else if (item.type === "module") {
      const free = p.modules.some(c => !c);
      buttons.push(["Equip", () => { equipItem(idx); refreshInv(); refreshHud(); }, !free]);
    } else if (item.type === "consumable") {
      if (item.kind === "dart") {
        buttons.push(["Throw", () => {
          ui.throwItem = item.id;
          closeInv();
          showMsg("Pick a target down a clear lane.");
          refreshHud();
        }, run.over]);
      } else {
        buttons.push(["Use", () => { useConsumable(idx); closeInv(); refreshHud(); }, run.over]);
      }
    }
    buttons.push(["Drop", () => { dropItem(idx); refreshInv(); refreshHud(); }]);
    bagEl.appendChild(itemCard(item, buttons));
  });
}
document.getElementById("btn-bag").addEventListener("click", () => {
  if (invOpen()) closeInv(); else openInv();
});
document.getElementById("inv-close").addEventListener("click", closeInv);

/* ------- enemy inspect: hover on desktop, long-press on touch ------- */
const inspectEl = document.getElementById("inspect");
function showInspect(e, sx, sy) {
  const def = ENEMY[e.type];
  const state =
    e.stagger > 0 ? "<span class='i-good'>OVERLOADED — counterstrikes deal double</span>" :
    e.state === "windup" ? (e.windupTimer > 1
      ? "<span class='i-warn'>charging — fires in 2 turns</span>"
      : "<span class='i-warn'>fires NEXT turn</span>") :
    e.rest > 0 ? "<span class='i-good'>recharging</span>" : "hunting";
  inspectEl.innerHTML =
    `<b>${e.elite ? "Prime " : ""}${def.name}</b>` +
    `<div>${e.hp}/${e.maxHp} integrity · hits for ${e.dmg}</div>` +
    `<div>${state}</div><div class="i-trait">${TRAITS[e.type]}</div>`;
  inspectEl.style.display = "block";
  const r = inspectEl.getBoundingClientRect();
  inspectEl.style.left = clamp(sx + 14, 6, W - r.width - 6) + "px";
  inspectEl.style.top = clamp(sy - r.height - 10, 6, H - r.height - 6) + "px";
}
function hideInspect() { inspectEl.style.display = "none"; }
function enemyAtScreen(sx, sy) {
  const w = screenToWorld(sx, sy);
  const h = pixelToHex(w.x, w.y);
  return run.enemies.find(e => e.q === h.q && e.r === h.r && visible.has(key(e.q, e.r)));
}

/* --------------------------------- input ------------------------------- */
function tryPlayerAction(q, r) {
  const p = run.player;
  if (run.over) return;
  const enemy = run.enemies.find(e => e.q === q && e.r === r && visible.has(key(e.q, e.r)));
  if (ui.rollMode) {
    const dq = q - p.q, dr = r - p.r;
    for (const [ddq, ddr] of DIRS) {
      if (ddq * 2 === dq && ddr * 2 === dr) {
        if (actRoll(ddq, ddr)) ui.rollMode = false;
        refreshHud();
        return;
      }
    }
    ui.rollMode = false;
    refreshHud();
    return;
  }
  if (ui.throwItem) {
    const idx = p.bag.findIndex(i => i.id === ui.throwItem);
    ui.throwItem = null;
    if (idx >= 0 && enemy) {
      if (!useConsumable(idx, enemy)) log("No clear lane for the dart.", "warn");
    }
    refreshHud();
    return;
  }
  if (enemy && canReach(enemy)) { actAttack(enemy); return; }
  const d = hexDist(p.q, p.r, q, r);
  if (d === 0) { actWait(); return; }
  if (d === 1) {
    actStep(q - p.q, r - p.r);
    return;
  }
  // distant tap: cautious auto-walk over explored ground
  startWalk(q, r);
}

function startWalk(tq, tr) {
  if (!walkable(tq, tr)) return;
  const t = run.tiles.get(key(tq, tr));
  if (!t.explored) return;
  ui.walking = { tq, tr, timer: 0 };
}
function walkTick(dt) {
  if (!ui.walking || run.over) { ui.walking = null; return; }
  ui.walking.timer -= dt;
  if (ui.walking.timer > 0) return;
  ui.walking.timer = 0.13;
  const p = run.player;
  // stop when danger is visible
  const danger = run.enemies.some(e => visible.has(key(e.q, e.r)));
  if (danger) { ui.walking = null; return; }
  const flow = bfsDist(key(ui.walking.tq, ui.walking.tr));
  let best = null, bd = flow.get(key(p.q, p.r));
  if (bd === undefined || bd === 0) { ui.walking = null; return; }
  for (const [dq, dr] of DIRS) {
    const d = flow.get(key(p.q + dq, p.r + dr));
    if (d !== undefined && d < bd && !occupied(p.q + dq, p.r + dr)) { bd = d; best = [dq, dr]; }
  }
  if (!best || !actStep(best[0], best[1])) { ui.walking = null; return; }
  refreshHud();
  if (p.q === ui.walking.tq && p.r === ui.walking.tr) ui.walking = null;
}
// hook the walk into the render loop
(function walkLoop() {
  let last = performance.now();
  const step = now => {
    walkTick((now - last) / 1000);
    last = now;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
})();

/* pointer: tap acts, drag pans, pinch zooms */
const pointers = new Map();
let pinch = null, dragDist = 0;
function screenToWorld(sx, sy) {
  return { x: (sx - W / 2) / cam.zoom + cam.x, y: (sy - H / 2) / cam.zoom + cam.y };
}
let longPress = null, inspected = false;
canvas.addEventListener("pointerdown", ev => {
  ev.preventDefault();
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY });
  dragDist = 0;
  inspected = false;
  if (ev.pointerType === "touch" && pointers.size === 1) {
    const sx = ev.clientX, sy = ev.clientY;
    longPress = setTimeout(() => {
      const e = enemyAtScreen(sx, sy);
      if (e) { showInspect(e, sx, sy); inspected = true; }
    }, 420);
  }
  if (pointers.size === 2) {
    clearTimeout(longPress);
    const [a, b] = [...pointers.values()];
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), zoom0: cam.zoom };
  }
});
canvas.addEventListener("pointermove", ev => {
  const prev = pointers.get(ev.pointerId);
  if (!prev) {
    // pure mouse hover: enemy inspection card
    if (ev.pointerType === "mouse") {
      const e = enemyAtScreen(ev.clientX, ev.clientY);
      if (e) showInspect(e, ev.clientX, ev.clientY);
      else hideInspect();
    }
    return;
  }
  const cur = { x: ev.clientX, y: ev.clientY, sx: prev.sx, sy: prev.sy };
  pointers.set(ev.pointerId, cur);
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    cam.zoom = clamp(pinch.zoom0 * d / Math.max(pinch.d0, 1), 0.45, 2.6);
    return;
  }
  dragDist += Math.hypot(cur.x - prev.x, cur.y - prev.y);
  if (dragDist > 8) {
    clearTimeout(longPress);
    cam.x -= (cur.x - prev.x) / cam.zoom;
    cam.y -= (cur.y - prev.y) / cam.zoom;
    cam.tx = undefined; cam.ty = undefined;   // manual pan overrides follow
  }
});
function endPointer(ev) {
  const p = pointers.get(ev.pointerId);
  pointers.delete(ev.pointerId);
  clearTimeout(longPress);
  if (pointers.size < 2) pinch = null;
  if (!p) return;
  if (inspected) { hideInspect(); inspected = false; return; }  // long-press was a look, not a move
  if (ev.pointerType === "touch") hideInspect();
  if (dragDist <= 8 && pointers.size === 0) {
    const w = screenToWorld(ev.clientX, ev.clientY);
    const h = pixelToHex(w.x, w.y);
    ui.walking = null;
    tryPlayerAction(h.q, h.r);
    refreshHud();
  }
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", ev => pointers.delete(ev.pointerId));
canvas.addEventListener("contextmenu", ev => ev.preventDefault());
canvas.addEventListener("wheel", ev => {
  ev.preventDefault();
  cam.zoom = clamp(cam.zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1), 0.45, 2.6);
}, { passive: false });

/* buttons + keys */
document.getElementById("btn-roll").addEventListener("click", () => {
  ui.rollMode = !ui.rollMode;
  refreshHud();
});
document.getElementById("btn-parry").addEventListener("click", () => { actParry(); refreshHud(); });
document.getElementById("btn-flask").addEventListener("click", () => { actFlask(); refreshHud(); });
document.getElementById("btn-wait").addEventListener("click", () => { actWait(); refreshHud(); });
document.getElementById("btn-rest").addEventListener("click", () => { actRest(); });
document.getElementById("mute").addEventListener("click", () => {
  muted = !muted;
  const per = persist();
  per.muted = muted;
  savePersist(per);
  document.getElementById("mute").textContent = muted ? "🔇" : "🔊";
});
document.getElementById("mute").textContent = muted ? "🔇" : "🔊";

window.addEventListener("keydown", ev => {
  if (run.over) return;
  const k = ev.key.toLowerCase();
  if (k === "r") { ui.rollMode = !ui.rollMode; }
  else if (k === "f") actParry();
  else if (k === "h" || k === "q") actFlask();
  else if (k === "b" || k === "i") { if (invOpen()) closeInv(); else openInv(); }
  else if (k === " ") { ev.preventDefault(); actWait(); }
  else if (k === "escape") { ui.rollMode = false; ui.throwItem = null; closeInv(); }
  refreshHud();
});

/* menu / overlays */
function showMenu() {
  const per = persist();
  document.getElementById("menu-stats").textContent =
    (per.deaths || 0) + " units lost · " + (per.wins || 0) + " cores taken · deepest: Sector " + (per.best || 0);
  document.getElementById("stain-note").textContent =
    per.stain ? "A wreck holding " + per.stain.souls + " cores waits in Sector " + per.stain.floor + "." : "";
  document.getElementById("menu").classList.remove("hidden");
}
function startRun(seed) {
  bought = {};
  ui.throwItem = null;
  ui.rollMode = false;
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("death").classList.add("hidden");
  document.getElementById("win").classList.add("hidden");
  document.getElementById("terminal").classList.add("hidden");
  document.getElementById("inv").classList.add("hidden");
  newRun(seed);
  cam.x = hexX(run.player.q, run.player.r);
  cam.y = hexY(run.player.q, run.player.r);
  centerCam();
  refreshHud();
  renderLog();
}
document.getElementById("begin-btn").addEventListener("click", () => startRun());
document.getElementById("death-retry").addEventListener("click", () => startRun());
document.getElementById("death-menu").addEventListener("click", () => {
  document.getElementById("death").classList.add("hidden");
  showMenu();
});
document.getElementById("win-again").addEventListener("click", () => startRun());
document.getElementById("win-menu").addEventListener("click", () => {
  document.getElementById("win").classList.add("hidden");
  showMenu();
});

/* --------------------------------- boot -------------------------------- */
newRun();          // backdrop world behind the menu
centerCam();
cam.x = hexX(run.player.q, run.player.r);
cam.y = hexY(run.player.q, run.player.r);
refreshHud();
showMenu();
requestAnimationFrame(render);

/* test/debug API */
window.RL = {
  get run() { return run; },
  newRun, startRun, descend,
  actStep, actWait, actAttack, actRoll, actParry, actFlask, actRest,
  spawnEnemy, endTurn, bfsDist, updateFov, hexDist,
  persist, savePersist, cam,
  ENEMY, PACTS, WEAPON_BASES, MODULES, AFFIXES,
  mkWeapon, mkModule, mkConsumable, rollLoot,
  giveItem, equipItem, unequipModule, dropItem, useConsumable,
  inCombat, recalc, canReach,
  setRun(r) { run = r; },
};
