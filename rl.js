/* =========================================================================
   EMBERHEX — a turn-based hex roguelike with souls-like combat.

   The one rule that makes it skill: combat is DETERMINISTIC and fully
   telegraphed. Every enemy shows exactly which hexes it will strike next
   turn. Every death is a misread, never a dice roll.

   Souls toolkit: stamina discipline, dodge-roll with pass-through,
   parry -> stagger -> riposte, backstabs against enemy facing, a flask
   that costs a turn to drink, bonfires that respawn the floor, souls
   spent on upgrades, and a bloodstain that persists across runs.
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
  hollow:  { name: "Hollow",  hp: 4,  dmg: 3, windup: 1, souls: 10, color: "#9b4a42" },
  archer:  { name: "Archer",  hp: 3,  dmg: 2, windup: 1, souls: 12, color: "#a8905c", range: 6 },
  brute:   { name: "Brute",   hp: 9,  dmg: 5, windup: 2, souls: 25, color: "#5a4a52" },
  stalker: { name: "Stalker", hp: 5,  dmg: 4, windup: 1, souls: 16, color: "#7a5a9c" },
  boss:    { name: "the Ashen King", hp: 34, dmg: 5, windup: 1, souls: 0, color: "#c9b458" },
};
const FLOORS = [
  { R: 8, spawn: { hollow: 4, archer: 1 } },
  { R: 8, spawn: { hollow: 4, archer: 2, brute: 1 }, elite: true },
  { R: 9, spawn: { hollow: 5, archer: 2, brute: 1, stalker: 2 }, elite: true },
  { R: 9, spawn: { hollow: 5, archer: 3, brute: 2, stalker: 2 }, elite: true },
  { R: 7, boss: true },
];
const FLASK_HEAL = 8;
const UPGRADES = [
  { id: "hp",    name: "Ember vitality", desc: "+4 max HP",        base: 30, apply: p => { p.maxHp += 4; p.hp += 4; } },
  { id: "st",    name: "Endurance",      desc: "+1 max stamina",   base: 50, apply: p => { p.maxSt += 1; p.st += 1; } },
  { id: "dmg",   name: "Hone blade",     desc: "+1 weapon damage", base: 60, apply: p => { p.dmg += 1; } },
  { id: "flask", name: "Deepen flask",   desc: "+1 flask charge",  base: 40, apply: p => { p.maxFlask += 1; p.flask += 1; } },
];

/* ------------------------------------------------------------ game state */
let run = null;
let eid = 0;

function persist() {
  try { return JSON.parse(localStorage.getItem("emberhex") || "{}"); } catch (e) { return {}; }
}
function savePersist(p) {
  try { localStorage.setItem("emberhex", JSON.stringify(p)); } catch (e) { /* private mode */ }
}

function newRun(seed) {
  run = {
    seed: seed === undefined ? (Math.random() * 1e9) | 0 : seed,
    floor: 0,
    player: {
      q: 0, r: 0, hp: 12, maxHp: 12, st: 3, maxSt: 3, dmg: 2,
      flask: 3, maxFlask: 3, souls: 0, parry: false, dead: false,
    },
    tiles: new Map(),
    enemies: [],
    shards: [],
    stairs: null, bonfire: null, bloodstain: null,
    turn: 0, kills: 0, over: false, won: false,
    log: [],
  };
  descend();
  return run;
}

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
  run.bloodstain = null;
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
    run.bonfire = { q: 0, r: R - 2, used: false };
    const tb = run.tiles.get(key(0, R - 2));
    if (tb) tb.rock = false;
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
  // bonfire roughly midway
  const mid = floorKeys.filter(k => {
    const d = dist.get(k);
    return d !== undefined && Math.abs(d - fd / 2) <= 2 && k !== pk && k !== far;
  });
  const bk = pick(mid.length ? mid : floorKeys);
  run.bonfire = { q: unkey(bk)[0], r: unkey(bk)[1], used: false };

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
      if (!elitePlaced && (type === "brute" || type === "stalker")) {
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
  log(run.floor === 5 ? "The Ashen King awaits." : "Floor " + run.floor + ".", "sys");
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
function actAttack(e) {
  const p = run.player;
  if (hexDist(p.q, p.r, e.q, e.r) !== 1 || !canAfford(1)) return false;
  p.st -= 1;
  // backstab: attacking from the enemy's rear arc (opposite facing +-1)
  const toPlayer = DIRS.findIndex(([dq, dr]) => e.q + dq === p.q && e.r + dr === p.r);
  const rear = [(e.dir + 3) % 6, (e.dir + 2) % 6, (e.dir + 4) % 6].includes(toPlayer);
  let dmg = p.dmg + (rear ? 2 : 0);
  if (e.stagger > 0) dmg *= 2;
  hurtEnemy(e, dmg, rear ? "backstab" : e.stagger > 0 ? "riposte" : null);
  endTurn();
  return true;
}
function actRoll(dq, dr) {
  // 2 hexes along one direction; pass through anything but rock; land free
  const p = run.player;
  if (!canAfford(2)) return false;
  const d = DIRS.findIndex(([q, r]) => q === dq && r === dr);
  if (d < 0) return false;
  const mq = p.q + dq, mr = p.r + dr;
  const lq = p.q + dq * 2, lr = p.r + dr * 2;
  const mt = run.tiles.get(key(mq, mr));
  if (!mt || mt.rock) return false;           // can't roll into a wall
  if (!walkable(lq, lr) || occupied(lq, lr)) return false;
  p.st -= 2;
  p.q = lq; p.r = lr;
  log("You roll.", "");
  afterPlayerMove();
  endTurn();
  return true;
}
function actParry() {
  const p = run.player;
  if (!canAfford(2)) return false;
  p.st -= 2;
  p.parry = true;
  endTurn();
  if (p.parry) { p.parry = false; log("Your parry meets empty air.", "warn"); }
  return true;
}
function actFlask() {
  const p = run.player;
  if (p.flask <= 0 || p.hp >= p.maxHp) return false;
  p.flask -= 1;
  p.hp = Math.min(p.maxHp, p.hp + FLASK_HEAL);
  log("You drink from the flask.", "good");
  addFloat(p.q, p.r, "+" + FLASK_HEAL, "#7fbf7f");
  endTurn();
  return true;
}
function actRest() {
  const p = run.player;
  const b = run.bonfire;
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
    if (n) log("You rest. The dark stirs — the floor lives again.", "warn");
    else log("You rest by the fire.", "good");
  } else {
    log("You rest. Beyond waits the King.", "good");
  }
  showShop();
  render();
  refreshHud();
  return true;
}

function afterPlayerMove() {
  const p = run.player;
  // pickups
  for (let i = run.shards.length - 1; i >= 0; i--) {
    const s = run.shards[i];
    if (s.q === p.q && s.r === p.r) {
      p.souls += s.souls;
      addFloat(p.q, p.r, "+" + s.souls + " souls", "#8fd48a");
      run.shards.splice(i, 1);
    }
  }
  if (run.bloodstain && run.bloodstain.q === p.q && run.bloodstain.r === p.r) {
    p.souls += run.bloodstain.souls;
    log("You recover " + run.bloodstain.souls + " souls from your predecessor.", "good");
    addFloat(p.q, p.r, "+" + run.bloodstain.souls + " souls", "#8fd48a");
    run.bloodstain = null;
    const per = persist();
    delete per.stain;
    savePersist(per);
  }
  if (run.stairs && run.stairs.q === p.q && run.stairs.r === p.r) {
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
    const souls = e.elite ? def.souls * 3 : def.souls;
    run.player.souls += souls;
    run.kills++;
    if (souls) addFloat(e.q, e.r, "+" + souls + " souls", "#8fd48a");
    run.enemies.splice(run.enemies.indexOf(e), 1);
    if (e.type === "boss") winRun();
    else log(def.name + " destroyed.", "");
  }
}

function hurtPlayer(e, dmg) {
  const p = run.player;
  // parry: negates a strike from an ADJACENT attacker, staggers it
  if (p.parry && hexDist(p.q, p.r, e.q, e.r) === 1) {
    p.parry = false;
    e.stagger = 2;
    e.state = "idle";
    e.windupHexes = [];
    log("PARRIED! " + ENEMY[e.type].name + " is staggered.", "good");
    addFloat(e.q, e.r, "staggered", "#f0c060");
    return;
  }
  p.hp -= dmg;
  addFloat(p.q, p.r, "-" + dmg, "#e06060");
  hitFlash = 0.3;
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
      // archers have rhythm: fire, recover, fire — a covered lane is a
      // timing puzzle, not a permanent wall
      if (e.type === "archer") e.rest = 1;
      // stagger 2, not 1: the decision loop below decrements once this same
      // turn, so 2 nets the player exactly one real punish window
      if (e.type === "brute") { e.stagger = 2; addFloat(e.q, e.r, "staggered", "#f0c060"); }
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
    case "hollow":
      if (dist === 1) {
        faceToward(e, p.q, p.r);
        e.state = "windup";
        e.windupTimer = def.windup;
        e.windupHexes = [key(p.q, p.r)];
      } else stepEnemyToward(e, flow);
      break;
    case "stalker": {
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
    case "archer": {
      if (e.rest > 0) { e.rest--; break; }
      // flee only when adjacent: a kiting range-2 archer can never be
      // caught on foot (equal speeds), which soft-locks melee play
      if (dist <= 1) { stepEnemyAway(e, flow); break; }
      const d = axisDir(e.q, e.r, p.q, p.r);
      if (d >= 0 && dist <= def.range && losClear(e.q, e.r, p.q, p.r)) {
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
    case "brute": {
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
    log("The Ashen King catches his breath.", "good");
    addFloat(e.q, e.r, "exhausted", "#f0c060");
    return;
  }
  if (!e.bossPhase2 && e.hp <= e.maxHp / 2) {
    e.bossPhase2 = true;
    // ring slam + summons, telegraphed 2 turns
    e.state = "windup";
    e.windupTimer = 2;
    e.windupKind = "slam";
    e.windupHexes = DIRS.map(([dq, dr]) => key(e.q + dq, e.r + dr));
    log("The King draws deep on the ember...", "warn");
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
    // summon two hollows
    const free = [];
    for (const [dq, dr] of DIRS) {
      const q = e.q + dq * 2, r = e.r + dr * 2;
      if (walkable(q, r) && !occupied(q, r)) free.push([q, r]);
    }
    for (let i = 0; i < 2 && free.length; i++) {
      const [q, r] = free.splice((i * 3) % free.length, 1)[0];
      const h = spawnEnemy("hollow", q, r);
      h.awake = true;
    }
    e.stagger = 2;   // resolved pre-decrement this turn; nets one window
    log("Hollows claw out of the ash!", "warn");
  } else {
    if (struck) hurtPlayer(e, 5);
  }
}

/* ------------------------------------------------------------ end states */
function dieRun() {
  const p = run.player;
  p.dead = true;
  run.over = true;
  const per = persist();
  per.deaths = (per.deaths || 0) + 1;
  per.best = Math.max(per.best || 0, run.floor);
  if (p.souls > 0) per.stain = { floor: run.floor, souls: p.souls };
  savePersist(per);
  document.getElementById("death-souls").textContent =
    p.souls > 0 ? p.souls + " souls left behind on floor " + run.floor + " — reclaim them next run."
                : "You carried nothing worth reclaiming.";
  document.getElementById("death-stats").textContent =
    "Floor " + run.floor + " · " + run.kills + " kills · turn " + run.turn;
  document.getElementById("death").classList.remove("hidden");
}

function winRun() {
  run.over = true;
  run.won = true;
  const per = persist();
  per.wins = (per.wins || 0) + 1;
  per.best = 5;
  delete per.stain;
  savePersist(per);
  document.getElementById("win-stats").textContent =
    run.kills + " kills · " + run.turn + " turns · " + run.player.souls + " souls unspent";
  document.getElementById("win").classList.remove("hidden");
}

/* =============================== RENDERING ============================== */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;
const cam = { x: 0, y: 0, zoom: 1 };
let hitFlash = 0;
const floats = [];
function addFloat(q, r, text, color) {
  floats.push({ x: hexX(q, r), y: hexY(q, r) - HEX * 0.4, text, color, life: 1.1 });
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

const FLOOR_COLOR = "#3b3640";
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
      c.fillStyle = shade("#221f26", t.shade);
      c.fill();
      hexPath(c, x, y, 0.72);
      c.fillStyle = shade("#4d4756", t.shade);
      c.fill();
    } else {
      c.fillStyle = shade(FLOOR_COLOR, t.shade);
      c.fill();
      hexPath(c, x, y);
      c.strokeStyle = "#00000038";
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
    c.fillStyle = t.explored ? "#0e0d1299" : "#0e0d12";
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

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#141216";
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(cam.zoom * DPR, 0, 0, cam.zoom * DPR,
    (W / 2 - cam.x * cam.zoom) * DPR, (H / 2 - cam.y * cam.zoom) * DPR);

  if (!terrainCache) buildTerrainCache();
  ctx.drawImage(terrainCache.canvas, -terrainCache.span, -terrainCache.span,
    terrainCache.span * 2, terrainCache.span * 2);

  const t = now / 1000;

  /* stairs, bonfire, shards, bloodstain */
  if (run.stairs && visibleOrExplored(run.stairs)) drawStairs(run.stairs);
  if (run.bonfire && visibleOrExplored(run.bonfire)) drawBonfire(run.bonfire, t);
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

  /* roll-mode targets */
  if (ui.rollMode) {
    for (const [dq, dr] of DIRS) {
      const q = run.player.q + dq * 2, r = run.player.r + dr * 2;
      const mq = run.player.q + dq, mr = run.player.r + dr;
      const mt = run.tiles.get(key(mq, mr));
      if (!mt || mt.rock || !walkable(q, r) || occupied(q, r)) continue;
      hexPath(ctx, hexX(q, r), hexY(q, r), 0.7);
      ctx.strokeStyle = "#8fd48a";
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
  hexPath(ctx, pos.x, pos.y, 0.62);
  ctx.fillStyle = "#dcd6c8";
  ctx.fill();
  hexPath(ctx, pos.x, pos.y, 0.62);
  ctx.strokeStyle = "#8a8578";
  ctx.lineWidth = 2;
  ctx.stroke();
  // visor
  ctx.fillStyle = "#2c2a33";
  ctx.fillRect(pos.x - 8, pos.y - 4, 16, 4);
  // plume
  ctx.fillStyle = "#b05050";
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - HEX * 0.55, 4.5, 0, TAU);
  ctx.fill();
  if (p.parry) {
    hexPath(ctx, pos.x, pos.y, 0.85);
    ctx.strokeStyle = "#f0d060";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}
function drawEnemy(e, t, dt) {
  const pos = entityPos(e);
  const def = ENEMY[e.type];
  e.flash = Math.max(0, (e.flash || 0) - dt);
  const big = e.type === "boss" ? 1.0 : e.type === "brute" ? 0.78 : 0.55;
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
  if (e.elite) {
    ctx.strokeStyle = "#f0d060";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // eye
  ctx.fillStyle = e.type === "boss" ? "#ffe9a0" : "#f0dcd0";
  ctx.beginPath();
  ctx.arc(HEX * big * 0.3, 0, HEX * big * 0.16, 0, TAU);
  ctx.fill();
  ctx.restore();
  if (e.type === "boss") {
    // crown
    ctx.fillStyle = "#f0d060";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("♔", pos.x, pos.y - HEX * 0.9);
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
function drawStairs(s) {
  const x = hexX(s.q, s.r), y = hexY(s.q, s.r);
  hexPath(ctx, x, y, 0.8);
  ctx.fillStyle = "#191721";
  ctx.fill();
  ctx.strokeStyle = "#6b647a";
  ctx.lineWidth = 2;
  for (let i = 3; i > 0; i--) {
    hexPath(ctx, x, y, 0.22 * i);
    ctx.stroke();
  }
}
function drawBonfire(b, t) {
  const x = hexX(b.q, b.r), y = hexY(b.q, b.r);
  // coiled sword + flame
  ctx.strokeStyle = "#7a7468";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y + 8);
  ctx.lineTo(x, y - 14);
  ctx.stroke();
  if (!b.used) {
    const fl = 0.8 + 0.2 * Math.sin(t * 7);
    const grad = ctx.createRadialGradient(x, y, 2, x, y, 22 * fl);
    grad.addColorStop(0, "rgba(255,180,80,0.85)");
    grad.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 22 * fl, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = b.used ? "#55504a" : "#ffb450";
  ctx.beginPath();
  ctx.arc(x, y + 4, 5, 0, TAU);
  ctx.fill();
}
function drawShard(s, t) {
  const x = hexX(s.q, s.r), y = hexY(s.q, s.r) + Math.sin(t * 3 + s.q) * 2;
  ctx.fillStyle = "#8fd48a";
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(x, y, 4, 7, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}
function drawStain(b, t) {
  const x = hexX(b.q, b.r), y = hexY(b.q, b.r);
  ctx.fillStyle = `rgba(120,220,140,${0.5 + 0.3 * Math.sin(t * 4)})`;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, TAU);
  ctx.fill();
}

/* ================================= UI =================================== */
const ui = { rollMode: false, walking: null, keys: {} };

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

  document.getElementById("btn-roll").classList.toggle("active", ui.rollMode);
  document.getElementById("btn-roll").disabled = p.st < 2 || run.over;
  document.getElementById("btn-parry").disabled = p.st < 2 || run.over;
  document.getElementById("btn-flask").disabled = p.flask <= 0 || p.hp >= p.maxHp || run.over;
  const b = run.bonfire;
  document.getElementById("btn-rest").classList.toggle("hidden",
    !b || b.used || hexDist(p.q, p.r, b.q, b.r) > 1 || run.over);
}

function renderLog() {
  const el = document.getElementById("log");
  el.innerHTML = run.log.slice(-4).map(l =>
    `<div class="${l.cls}">${l.msg}</div>`).join("");
}

/* ------- shop (bonfire) ------- */
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
    el.innerHTML = `<b>${u.name}</b><span>${u.desc}</span><em>${cost} souls</em>`;
    el.addEventListener("click", () => {
      if (p.souls < cost) return;
      p.souls -= cost;
      bought[u.id] = n + 1;
      u.apply(p);
      log(u.name + " acquired.", "good");
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
  const d = hexDist(p.q, p.r, q, r);
  if (d === 0) { actWait(); return; }
  if (d === 1) {
    if (enemy) { actAttack(enemy); return; }
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
canvas.addEventListener("pointerdown", ev => {
  ev.preventDefault();
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY });
  dragDist = 0;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), zoom0: cam.zoom };
  }
});
canvas.addEventListener("pointermove", ev => {
  const prev = pointers.get(ev.pointerId);
  if (!prev) return;
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
    cam.x -= (cur.x - prev.x) / cam.zoom;
    cam.y -= (cur.y - prev.y) / cam.zoom;
    cam.tx = undefined; cam.ty = undefined;   // manual pan overrides follow
  }
});
function endPointer(ev) {
  const p = pointers.get(ev.pointerId);
  pointers.delete(ev.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!p) return;
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

window.addEventListener("keydown", ev => {
  if (run.over) return;
  const k = ev.key.toLowerCase();
  if (k === "r") { ui.rollMode = !ui.rollMode; }
  else if (k === "f") actParry();
  else if (k === "h" || k === "q") actFlask();
  else if (k === " ") { ev.preventDefault(); actWait(); }
  else if (k === "escape") ui.rollMode = false;
  refreshHud();
});

/* menu / overlays */
function showMenu() {
  const per = persist();
  document.getElementById("menu-stats").textContent =
    (per.deaths || 0) + " deaths · " + (per.wins || 0) + " victories · deepest: floor " + (per.best || 0);
  document.getElementById("stain-note").textContent =
    per.stain ? "A bloodstain with " + per.stain.souls + " souls waits on floor " + per.stain.floor + "." : "";
  document.getElementById("menu").classList.remove("hidden");
}
function startRun(seed) {
  bought = {};
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("death").classList.add("hidden");
  document.getElementById("win").classList.add("hidden");
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
  setRun(r) { run = r; },
};
