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

   Gear is classic ARPG loot: weapons, plating and modules drop in Normal,
   Magic and Rare grades (plus a few Uniques), roll prefix/suffix modifiers
   scaled by depth, and are crafted with currency orbs. See BASE_TYPES,
   PREFIXES/SUFFIXES and CURRENCY below.
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
  sentinel: { name: "the SENTINEL", hp: 30, dmg: 5, windup: 2, souls: 150, color: "#e05a7a" },
};
const TRAITS = {
  scrapper: "Salvage bot running a broken loop. Closes and swings.",
  railer:   "Rail slug rakes an entire lane — it does not check for friendlies. Must recharge after each shot.",
  bulwark:  "Frontal shield emitter absorbs everything it faces. Flank it, or deflect to overload the field. Resets after swinging.",
  mortar:   "Arcs charges over walls — a wide blast, two turns out. Cover is no cover. Reloads after firing.",
  crusher:  "Slow siege chassis. Shockwaves everything adjacent — then its servos lock up.",
  ripper:   "Covers two hexes a turn. Blades sized for your spine.",
  boss:     "Overheats after every third attack. Below half integrity, it calls the fabricators.",
  sentinel: "Gate guardian. Its field slam covers everything around it EXCEPT its coolant vents — stand IN a gap. Its sweep alternates lanes: the amber lanes fire one turn after the red ones, so dodge into amber, then step back. Overheats after every third attack.",
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

/* ================================ ARSENAL ===============================
   Loot works like a classic ARPG (Path of Exile style). Every item is a
   BASE TYPE (which fixes its slot and implicit modifier) at a RARITY:
   Normal (no modifiers), Magic (up to 1 prefix + 1 suffix), Rare (up to
   2 prefixes + 2 suffixes), or a hand-authored Unique. Modifier values
   roll in depth-scaled tiers. Currency orbs craft items between rarities.
   ========================================================================= */
const SLOTS = ["weapon", "plating", "sensor", "drive", "utility"];
const SLOT_LABEL = {
  weapon: "Weapon", plating: "Plating", sensor: "Sensor",
  drive: "Drive", utility: "Utility",
};
const RARITY = {
  normal: { name: "Normal", color: "#c8d4de", maxPrefix: 0, maxSuffix: 0 },
  magic:  { name: "Magic",  color: "#6fa8ff", maxPrefix: 1, maxSuffix: 1 },
  rare:   { name: "Rare",   color: "#ffd45c", maxPrefix: 2, maxSuffix: 2 },
  unique: { name: "Unique", color: "#ff9040", maxPrefix: 0, maxSuffix: 0 },
};
const BASE_TYPES = {
  blade:     { name: "Arc Blade", slot: "weapon", implicit: {},
               dmg: 2, atkCost: 1, rollCost: 2, bsBonus: 2,
               desc: "Balanced servo-driven arc blade. Answers most things." },
  shiv:      { name: "Needle Shiv", slot: "weapon", implicit: {},
               dmg: 1, atkCost: 1, rollCost: 1, bsBonus: 4,
               desc: "Light frame: dashes cost 1 power. Weak swings, devastating into an exposed core." },
  cleaver:   { name: "Plasma Cleaver", slot: "weapon", implicit: {},
               dmg: 4, atkCost: 2, rollCost: 2, bsBonus: 2, cleave: true,
               desc: "Discharge (2 power) cleaves a three-hex arc." },
  lance:     { name: "Rail Lance", slot: "weapon", implicit: {},
               dmg: 2, atkCost: 1, rollCost: 2, bsBonus: 2, reach: true,
               desc: "Reach: strike two hexes down a line." },
  plating:   { name: "Ablative Plate", slot: "plating", implicit: { maxHpBonus: 3 },
               desc: "Standard structural armor." },
  bulkhead:  { name: "Bulkhead Segment", slot: "plating", implicit: { maxHpBonus: 5, rollCostDelta: 1 },
               desc: "Heavy salvage plate. Serious protection that weighs on the thrusters." },
  optics:    { name: "Targeting Optics", slot: "sensor", implicit: { bsBonus: 2 },
               desc: "Sharper strikes into an exposed core." },
  array:     { name: "Sensor Array", slot: "sensor", implicit: { fovBonus: 1 },
               desc: "Extends your sensor range." },
  servo:     { name: "Servo Drive", slot: "drive", implicit: { rollCostDelta: -1 },
               desc: "Cheapens the thruster dash." },
  regulator: { name: "Nanite Regulator", slot: "drive", implicit: { flaskHealBonus: 3 },
               desc: "Boosts repair-cell output." },
  capacitor: { name: "Capacitor Cell", slot: "utility", implicit: { maxStBonus: 1 },
               desc: "Widens your power reserve." },
  recycler:  { name: "Recycler Loop", slot: "utility", implicit: { salvageMult: 1 / 3 },
               desc: "Extracts more cores from kills." },
  reclaimer: { name: "Reclamation Coil", slot: "utility", implicit: { siphonOnKill: 1 },
               desc: "Feeds a sliver of integrity back on every kill." },
  dampener:  { name: "Dampener Coil", slot: "utility", implicit: { parryCostDelta: -1 },
               desc: "Cheapens the deflector field." },
};
const BARE_FISTS = { name: "Bare Fists", dmg: 1, atkCost: 1, rollCost: 2, bsBonus: 0, cleave: false, reach: false };

// stat vocabulary every modifier draws from — a closed, uniform set so
// recalc() is a simple sum.
const STAT_KEYS = ["dmg", "maxHpBonus", "maxStBonus", "bsBonus", "flaskHealBonus",
  "salvageMult", "siphonOnKill", "rollCostDelta", "parryCostDelta", "fovBonus"];
const STAT_LABEL = {
  dmg: "dmg", maxHpBonus: "max integrity", maxStBonus: "max power", bsBonus: "rear-strike dmg",
  flaskHealBonus: "repair-cell heal", salvageMult: "% core yield", siphonOnKill: "heal-on-kill",
  rollCostDelta: "dash cost", parryCostDelta: "deflect cost", fovBonus: "sensor range",
};

/* affix pools: prefixes carry raw power, suffixes carry utility. Each has
   three tiers; deeper sectors roll higher tiers. One modifier per stat
   per item, like one mod per group. */
const PREFIXES = [
  { stat: "dmg",            names: ["Honed", "Brutal", "Merciless"],           tiers: [1, 2, 3] },
  { stat: "maxHpBonus",     names: ["Plated", "Reinforced", "Fortified"],      tiers: [2, 4, 6] },
  { stat: "bsBonus",        names: ["Piercing", "Incisive", "Eviscerating"],   tiers: [1, 2, 3] },
  { stat: "flaskHealBonus", names: ["Self-Sealing", "Regenerative", "Undying"], tiers: [2, 4, 6] },
  { stat: "salvageMult",    names: ["Scavenger's", "Harvester's", "Magnate's"], tiers: [0.15, 0.25, 0.4] },
];
const SUFFIXES = [
  { stat: "maxStBonus",     names: ["of Capacity", "of the Dynamo", "of the Reactor"],   tiers: [1, 1, 2] },
  { stat: "rollCostDelta",  names: ["of Thrust", "of Burn", "of Flight"],                tiers: [-1, -1, -1] },
  { stat: "parryCostDelta", names: ["of Deflection", "of the Aegis", "of the Bulwark"],  tiers: [-1, -1, -1] },
  { stat: "fovBonus",       names: ["of Sight", "of the Beacon", "of the Watchtower"],   tiers: [1, 2, 3] },
  { stat: "siphonOnKill",   names: ["of Leeching", "of Siphoning", "of Reclamation"],    tiers: [1, 1, 1] },
];
// corrupted-terminal downside mods (corruption also locks the item to orbs)
const CORRUPT_MODS = [
  { stat: "maxHpBonus", val: -3 }, { stat: "maxStBonus", val: -1 },
  { stat: "rollCostDelta", val: 1 }, { stat: "parryCostDelta", val: 1 },
];
// tier weights [t1,t2,t3] by sector depth
const TIER_WEIGHTS = { 1: [4, 1, 0], 2: [3, 2, 0], 3: [2, 2, 1], 4: [1, 2, 2], 5: [0, 2, 3] };

const RARE_NAME_A = ["Doom", "Storm", "Iron", "Ghost", "Ash", "Grim", "Vesta", "Null", "Ruin", "Ember"];
const RARE_NAME_B = ["Whisper", "Bane", "Coil", "Ward", "Cry", "Spike", "Pulse", "Vault", "Brand", "Fang"];

const UNIQUES = [
  { name: "Overseer's Eye", base: "optics",
    effects: { bsBonus: 3, fovBonus: 2, dmg: 1 },
    lore: "It watched everything down here die. Now it watches for you." },
  { name: "Vesta's Heart", base: "regulator",
    effects: { flaskHealBonus: 6, maxHpBonus: 4 },
    lore: "The foundry's first reactor never stopped beating." },
  { name: "Last Argument", base: "cleaver",
    effects: { dmg: 3, maxStBonus: 1 },
    lore: "There is no counter-proposal." },
];

let itemSeq = 0;
function rollTier(rng, depth) {
  const w = TIER_WEIGHTS[clamp(depth, 1, 5)];
  const total = w[0] + w[1] + w[2];
  let r = rng() * total;
  for (let t = 0; t < 3; t++) { if (r < w[t]) return t + 1; r -= w[t]; }
  return 1;
}
function itemAffixCount(item, kind) { return item.affixes.filter(a => a.kind === kind).length; }
function affixRoom(item, kind) {
  const cap = RARITY[item.rarity];
  return itemAffixCount(item, kind) < (kind === "prefix" ? cap.maxPrefix : cap.maxSuffix);
}
function rollAffix(rng, item, kind, depth) {
  const pool = (kind === "prefix" ? PREFIXES : SUFFIXES).filter(def =>
    !item.affixes.some(a => a.stat === def.stat));
  if (!pool.length) return null;
  const def = pool[(rng() * pool.length) | 0];
  const tier = rollTier(rng, depth);
  return {
    id: ++itemSeq, kind, stat: def.stat, tier,
    label: def.names[tier - 1],
    effect: { [def.stat]: def.tiers[tier - 1] },
  };
}
// add one affix of whichever kind has room (random when both do)
function addRandomAffix(rng, item, depth) {
  const kinds = ["prefix", "suffix"].filter(k => affixRoom(item, k));
  if (!kinds.length) return false;
  const kind = kinds[(rng() * kinds.length) | 0];
  const a = rollAffix(rng, item, kind, depth);
  if (!a) return false;
  item.affixes.push(a);
  return true;
}
function nameItem(rng, item) {
  const base = BASE_TYPES[item.base];
  if (item.rarity === "magic") {
    const pre = item.affixes.find(a => a.kind === "prefix");
    const suf = item.affixes.find(a => a.kind === "suffix");
    item.name = (pre ? pre.label + " " : "") + base.name + (suf ? " " + suf.label : "");
  } else if (item.rarity === "rare") {
    item.name = RARE_NAME_A[(rng() * RARE_NAME_A.length) | 0] + " " +
                RARE_NAME_B[(rng() * RARE_NAME_B.length) | 0];
  } else {
    item.name = base.name;
  }
}
function genItem(rng, baseKey, rarity, depth) {
  const item = {
    id: ++itemSeq, base: baseKey, rarity,
    name: BASE_TYPES[baseKey].name,
    affixes: [], corrupted: false, lore: null,
  };
  const n = rarity === "magic" ? 1 + (rng() < 0.5 ? 1 : 0)
          : rarity === "rare" ? 3 + (rng() < 0.5 ? 1 : 0) : 0;
  for (let i = 0; i < n; i++) addRandomAffix(rng, item, depth);
  nameItem(rng, item);
  return item;
}
function genUnique(rng) {
  const u = UNIQUES[(rng() * UNIQUES.length) | 0];
  return {
    id: ++itemSeq, base: u.base, rarity: "unique", name: u.name,
    affixes: [{ id: ++itemSeq, kind: "unique", stat: null, tier: 0, label: null, effect: u.effects }],
    corrupted: false, lore: u.lore,
  };
}
function rollRarity(rng, depth, elite) {
  const w = [
    ["unique", elite ? 4 : 1],
    ["rare", 10 + depth * 3 + (elite ? 25 : 0)],
    ["magic", 35 + depth * 3 + (elite ? 25 : 0)],
    ["normal", elite ? 0 : 50],
  ];
  const total = w.reduce((s, [, x]) => s + x, 0);
  let r = rng() * total;
  for (const [k, wt] of w) { if (r < wt) return k; r -= wt; }
  return "normal";
}
function rollBaseType(rng) {
  const keys = Object.keys(BASE_TYPES);
  const weighted = keys.map(k => [k, BASE_TYPES[k].slot === "weapon" ? 3 : 2]);
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of weighted) { if (r < w) return k; r -= w; }
  return keys[0];
}
function rollItemLoot(rng, depth, elite) {
  const rarity = rollRarity(rng, depth, elite);
  if (rarity === "unique") return genUnique(rng);
  return genItem(rng, rollBaseType(rng), rarity, depth);
}
// the last armory before the OVERSEER: a guaranteed rare weapon
function genArmoryItem(rng) {
  const weapons = Object.keys(BASE_TYPES).filter(k => BASE_TYPES[k].slot === "weapon");
  return genItem(rng, weapons[(rng() * weapons.length) | 0], "rare", 5);
}
// corrupted-terminal stock: a rare with a downside baked in, sealed to orbs
function genCorruptedItem(rng, depth) {
  const item = genItem(rng, rollBaseType(rng), "rare", depth);
  const mod = CORRUPT_MODS[(rng() * CORRUPT_MODS.length) | 0];
  item.affixes.push({ id: ++itemSeq, kind: "corrupt", stat: mod.stat, tier: 0,
    label: "Corrupted", effect: { [mod.stat]: mod.val } });
  item.corrupted = true;
  return item;
}

/* ------- currency orbs: the crafting economy ------- */
const CURRENCY = {
  transmute: { name: "Orb of Transmutation", desc: "Upgrades a Normal item to Magic with one modifier." },
  aug:       { name: "Orb of Augmentation",  desc: "Adds a modifier to a Magic item." },
  alch:      { name: "Orb of Alchemy",       desc: "Upgrades a Normal item to Rare with three or four modifiers." },
  regal:     { name: "Regal Orb",            desc: "Upgrades a Magic item to Rare, keeping its modifiers and adding one." },
  exalt:     { name: "Exalted Orb",          desc: "Adds a modifier to a Rare item." },
  chaos:     { name: "Chaos Orb",            desc: "Removes one modifier from a Rare item and adds a new one." },
};
function rollOrbKind(rng, depth) {
  const w = [
    ["transmute", 4], ["aug", 4], ["alch", 3], ["regal", 2],
    ["exalt", depth >= 3 ? 2 : 1], ["chaos", depth >= 3 ? 2 : 1],
  ];
  const total = w.reduce((s, [, x]) => s + x, 0);
  let r = rng() * total;
  for (const [k, wt] of w) { if (r < wt) return k; r -= wt; }
  return "transmute";
}
function rollChestContents(rng, depth, elite) {
  const r = rng();
  if (!elite && r < 0.22) {
    return { kind: "supply", supply: rng() < 0.6 ? "dart" : "cell", n: 1 + (depth >= 3 && rng() < 0.4 ? 1 : 0) };
  }
  if (!elite && r < 0.52) {
    return { kind: "currency", orb: rollOrbKind(rng, depth), n: 1 + (rng() < 0.4 ? 1 : 0) };
  }
  return { kind: "item", item: rollItemLoot(rng, depth, elite) };
}
const CONSUMABLE_DESC = {
  dart: "Hurl down a clear lane: 4 damage to the first machine, up to 4 hexes. Costs the turn.",
  cell: "Restore all power and 2 integrity. Costs the turn.",
};

/* ============================== THE FOUNDRY =============================
   Endgame overworld (PoE2 Atlas style). After the OVERSEER falls, the
   Foundry opens: an endless hex map of sealed sector nodes spreading
   outward from the Bay. Nodes carry a biome but NO tier — the Sector Key
   you socket sets the sector's tier (danger and rewards), exactly like a
   PoE2 waystone sets the map level. Keys are craftable items: the same
   currency orbs roll sector modifiers onto them, each trading danger for
   bonus loot. Purge every Prime unit to clear a node and reveal its
   neighbors. Dying consumes the key and leaves your cores as a wreck in
   the node. Character, gear, currency and map all persist.
   ========================================================================= */
const TIER_CAP = 15;   // absolute ceiling; SENTINEL gates raise the live cap
const TIER_COLOR = ["#c8d4de", "#6fa8ff", "#ffd45c", "#ff9040"];
function tierColor(t) { return TIER_COLOR[(t - 1) % 4]; }
function atlasCap() { return (profile && profile.atlas && profile.atlas.tierCap) || 4; }
const BIOMES = {
  scrapyard: { name: "Scrapyard", abbr: "SCRP", color: "#e8875a", rock: 0.30,
    desc: "Hull heaps and fast salvage packs.",
    spawn: t => ({ scrapper: 3 + t, ripper: 1 + (t >= 2 ? 1 : 0) }) },
  raildepot: { name: "Rail Depot", abbr: "RAIL", color: "#b09340", rock: 0.20,
    desc: "Open sight lines. Artillery country.",
    spawn: t => ({ scrapper: 2, railer: 2 + (t >= 2 ? 1 : 0), mortar: t >= 2 ? 1 : 0 }) },
  bastion:   { name: "Bastion Line", abbr: "BSTN", color: "#7fa0d8", rock: 0.33,
    desc: "Dense cover held by shielded armor.",
    spawn: t => ({ scrapper: 2, bulwark: 1 + (t >= 2 ? 1 : 0), crusher: t >= 2 ? 1 : 0, ripper: t >= 3 ? 1 : 0 }) },
  vault:     { name: "Archive Vault", abbr: "VLT", color: "#c77dff", rock: 0.28, chests: 2,
    desc: "Deep storage. Rich caches, live guards.",
    spawn: t => ({ scrapper: 2 + t, railer: 1, bulwark: t >= 3 ? 1 : 0 }) },
};
function keyFabCost(tier) { return Math.round(30 * Math.pow(tier, 1.7)); }

/* Sector Key modifiers: every danger mod also raises loot quantity.
   Normal keys carry 0 mods, Magic up to 2, Rare up to 4 — crafted with
   the same currency orbs as gear. All mods stay deterministic. */
const KEY_MODS = [
  { key: "swarming",    name: "Swarming",    desc: "+50% enemy packs",                quant: 0.20, apply: m => { m.spawnMult *= 1.5; } },
  { key: "overcharged", name: "Overcharged", desc: "machines hit for +1",             quant: 0.15, apply: m => { m.dmgAdd += 1; } },
  { key: "armored",     name: "Armored",     desc: "machines +30% integrity",         quant: 0.15, apply: m => { m.hpMult *= 1.3; } },
  { key: "primed",      name: "Primed",      desc: "+1 Prime unit",                   quant: 0.20, apply: m => { m.extraElites += 1; } },
  { key: "dark",        name: "Darkened",    desc: "sensor range -2",                 quant: 0.15, apply: m => { m.fovPenalty += 2; } },
  { key: "volatile",    name: "Volatile",    desc: "machines detonate on death: 1 dmg adjacent", quant: 0.20, apply: m => { m.volatile = true; } },
  { key: "rusted",      name: "Rusted",      desc: "repair cells heal -3",            quant: 0.10, apply: m => { m.flaskPenalty += 3; } },
];
const KEY_MOD_BY = Object.fromEntries(KEY_MODS.map(m => [m.key, m]));
const KEY_MOD_CAP = { normal: 0, magic: 2, rare: 4 };
function makeKey(tier, rarity) {
  return { id: ++itemSeq, tier, rarity: rarity || "normal", name: null, affixes: [] };
}
function addKeyMod(rng, k) {
  if (k.affixes.length >= (KEY_MOD_CAP[k.rarity] || 0)) return false;
  const pool = KEY_MODS.filter(m => !k.affixes.some(a => a.mod === m.key));
  if (!pool.length) return false;
  const m = pool[(rng() * pool.length) | 0];
  k.affixes.push({ id: ++itemSeq, mod: m.key });
  return true;
}
function keyQuant(k) {
  return k.affixes.reduce((s, a) => s + KEY_MOD_BY[a.mod].quant, 0);
}
function nameRareKey(rng, k) {
  k.name = RARE_NAME_A[(rng() * RARE_NAME_A.length) | 0] + " " +
           RARE_NAME_B[(rng() * RARE_NAME_B.length) | 0];
}
function keyDisplayName(k) {
  if (k.rarity === "rare") return (k.name || "Sealed Directive") + " (T" + k.tier + ")";
  if (k.rarity === "magic" && k.affixes.length)
    return KEY_MOD_BY[k.affixes[0].mod].name + " T" + k.tier + " Sector Key";
  return "T" + k.tier + " Sector Key";
}

const UPGRADES = [
  { id: "hp",    name: "Chassis reinforcement", desc: "+4 max integrity", base: 30, apply: p => { p.baseMaxHp += 4; p.hp += 4; } },
  { id: "st",    name: "Capacitor bank",        desc: "+1 max power",     base: 50, apply: p => { p.baseMaxSt += 1; p.st += 1; } },
  { id: "dmg",   name: "Weapon calibration",    desc: "+1 weapon damage", base: 60, apply: p => { p.bonusDmg += 1; } },
  { id: "flask", name: "Nanite reservoir",      desc: "+1 repair cell",   base: 40, apply: p => { p.maxFlask += 1; p.flask += 1; } },
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

/* persistent endgame profile: your character + the Foundry overworld */
const PROFILE_KEY = "ironhex-foundry";
function loadProfile() {
  try { return migrateProfile(JSON.parse(localStorage.getItem(PROFILE_KEY) || "null")); }
  catch (e) { return null; }
}
// v1 -> v2: keys become craftable items; nodes drop their intrinsic tier
function migrateProfile(pr) {
  if (!pr) return pr;
  if (!pr.v || pr.v < 2) {
    for (const k of pr.atlas.keys || []) {
      if (!k.rarity) k.rarity = "normal";
      if (!k.affixes) k.affixes = [];
      if (k.name === undefined) k.name = null;
    }
    for (const n of Object.values(pr.atlas.nodes || {})) delete n.tier;
    pr.v = 2;
  }
  // v2 -> v3: tier bands gated by SENTINEL bosses
  if (pr.v < 3) {
    if (!pr.atlas.tierCap) pr.atlas.tierCap = 4;
    pr.v = 3;
  }
  return pr;
}
let profile = loadProfile();
function saveProfile() {
  if (!profile) return;
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) { /* private mode */ }
}
function bumpItemSeqFromProfile() {
  if (!profile) return;
  const scan = it => {
    if (it.id > itemSeq) itemSeq = it.id;
    for (const a of it.affixes || []) if (a.id > itemSeq) itemSeq = a.id;
  };
  (profile.character.items || []).forEach(scan);
  (profile.atlas.keys || []).forEach(scan);
}
bumpItemSeqFromProfile();

function newRun(seed) {
  run = {
    mode: "campaign", floorConf: null, sectorNode: null,
    eliteTotal: 0, eliteKilled: 0,
    seed: seed === undefined ? (Math.random() * 1e9) | 0 : seed,
    floor: 0,
    player: {
      q: 0, r: 0, hp: 12, st: 3,
      baseMaxHp: 12, baseMaxSt: 3, bonusDmg: 0,
      items: [], equip: { weapon: null, plating: null, sensor: null, drive: null, utility: null },
      currency: { transmute: 2, aug: 1, alch: 1, regal: 0, exalt: 0, chaos: 0 },
      consumables: { dart: 1, cell: 0 },
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
  const starter = genItem(mulberry32(run.seed >>> 0), "blade", "normal", 1);
  p.items.push(starter);
  p.equip.weapon = starter.id;
  recalc();
  descend();
  return run;
}

/* -------------------------------------------------------------- gear API */
function itemById(id) { return run.player.items.find(i => i.id === id); }
function itemSlot(item) { return BASE_TYPES[item.base].slot; }
function equippedItem(slot) {
  const id = run.player.equip[slot];
  return id === null ? null : itemById(id);
}
function isEquipped(id) { return SLOTS.some(s => run.player.equip[s] === id); }
// an item's total contribution: base implicit + every modifier
function itemEffect(item) {
  const out = {};
  for (const k of STAT_KEYS) out[k] = 0;
  const imp = BASE_TYPES[item.base].implicit;
  for (const k in imp) out[k] += imp[k];
  for (const a of item.affixes) {
    for (const k in a.effect) if (STAT_KEYS.includes(k)) out[k] += a.effect[k];
  }
  return out;
}
function equipItem(id) {
  const item = itemById(id);
  if (!item) return false;
  const slot = itemSlot(item);
  if (run.player.equip[slot] === id) return false;
  run.player.equip[slot] = id;
  recalc();
  log(item.name + " equipped.", "good");
  sfx("core");
  spendGearTurn();
  return true;
}
function unequipItem(slot) {
  if (run.player.equip[slot] === null) return false;
  run.player.equip[slot] = null;
  recalc();
  log(SLOT_LABEL[slot] + " slot cleared.", "");
  spendGearTurn();
  return true;
}
function dropItem(id) {
  const item = itemById(id);
  if (!item || isEquipped(id)) return false;
  run.player.items = run.player.items.filter(i => i.id !== id);
  log(item.name + " discarded.", "");
  return true;
}
function activeWeaponItem() { return equippedItem("weapon"); }
function getActiveWeaponType() {
  const w = activeWeaponItem();
  return w ? BASE_TYPES[w.base] : BARE_FISTS;
}

/* orb crafting */
let craftRng = mulberry32((Math.random() * 1e9) | 0);
function canApplyOrb(kind, item) {
  if (!item) return { ok: false, reason: "No item." };
  if (item.corrupted) return { ok: false, reason: "Corrupted — orbs are rejected." };
  if (item.rarity === "unique") return { ok: false, reason: "Uniques can't be modified." };
  switch (kind) {
    case "transmute":
      return item.rarity === "normal" ? { ok: true } : { ok: false, reason: "Needs a Normal item." };
    case "alch":
      return item.rarity === "normal" ? { ok: true } : { ok: false, reason: "Needs a Normal item." };
    case "aug":
      if (item.rarity !== "magic") return { ok: false, reason: "Needs a Magic item." };
      return (affixRoom(item, "prefix") || affixRoom(item, "suffix"))
        ? { ok: true } : { ok: false, reason: "No room for another modifier." };
    case "regal":
      return item.rarity === "magic" ? { ok: true } : { ok: false, reason: "Needs a Magic item." };
    case "exalt":
      if (item.rarity !== "rare") return { ok: false, reason: "Needs a Rare item." };
      return (affixRoom(item, "prefix") || affixRoom(item, "suffix"))
        ? { ok: true } : { ok: false, reason: "No room for another modifier." };
    case "chaos":
      if (item.rarity !== "rare") return { ok: false, reason: "Needs a Rare item." };
      return item.affixes.length ? { ok: true } : { ok: false, reason: "No modifiers to reroll." };
  }
  return { ok: false, reason: "Unknown orb." };
}
function applyOrb(kind, itemId) {
  const p = run.player;
  const item = itemById(itemId);
  if ((p.currency[kind] || 0) <= 0) return false;
  const check = canApplyOrb(kind, item);
  if (!check.ok) { log(check.reason, "warn"); return false; }
  const depth = run.floor || 1;
  p.currency[kind]--;
  switch (kind) {
    case "transmute":
      item.rarity = "magic";
      addRandomAffix(craftRng, item, depth);
      break;
    case "aug":
      addRandomAffix(craftRng, item, depth);
      break;
    case "alch": {
      item.rarity = "rare";
      const n = 3 + (craftRng() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) addRandomAffix(craftRng, item, depth);
      break;
    }
    case "regal":
      item.rarity = "rare";
      addRandomAffix(craftRng, item, depth);
      break;
    case "exalt":
      addRandomAffix(craftRng, item, depth);
      break;
    case "chaos": {
      const idx = (craftRng() * item.affixes.length) | 0;
      item.affixes.splice(idx, 1);
      addRandomAffix(craftRng, item, depth);
      break;
    }
  }
  nameItem(craftRng, item);
  recalc();
  log(CURRENCY[kind].name + " → " + item.name + ".", "good");
  sfx("core");
  spendGearTurn();
  return true;
}
function grantOrbs(rng, n, depth) {
  const p = run.player;
  for (let i = 0; i < n; i++) {
    const kind = rollOrbKind(rng, depth);
    p.currency[kind] = (p.currency[kind] || 0) + 1;
    log(CURRENCY[kind].name + " acquired.", "good");
    addFloat(p.q, p.r, "+" + CURRENCY[kind].name, "#c9a24b");
  }
}
function describeEffect(effect) {
  const parts = [];
  for (const k of STAT_KEYS) {
    const v = effect[k];
    if (!v) continue;
    if (k === "siphonOnKill") { parts.push("heal on kill"); continue; }
    if (k === "salvageMult") { parts.push((v > 0 ? "+" : "") + Math.round(v * 100) + "% core yield"); continue; }
    parts.push((v > 0 ? "+" : "") + v + " " + STAT_LABEL[k]);
  }
  return parts.length ? parts.join(", ") : "no active effect";
}

/* derive combat stats from equipped gear + protocol upgrades */
function recalc() {
  const p = run.player;
  const weaponType = getActiveWeaponType();
  const totals = {};
  for (const k of STAT_KEYS) totals[k] = 0;
  for (const slot of SLOTS) {
    const item = equippedItem(slot);
    if (!item) continue;
    const eff = itemEffect(item);
    for (const k of STAT_KEYS) totals[k] += eff[k];
  }
  p.dmg = weaponType.dmg + p.bonusDmg + totals.dmg;
  p.atkCost = weaponType.atkCost;
  p.bsBonus = weaponType.bsBonus + totals.bsBonus;
  p.cleave = !!weaponType.cleave;
  p.reach = !!weaponType.reach;
  p.rollCost = clamp(weaponType.rollCost + totals.rollCostDelta, 1, 4);
  p.parryCost = clamp(2 + totals.parryCostDelta, 1, 3);
  p.maxHp = Math.max(1, p.baseMaxHp + totals.maxHpBonus);
  p.hp = Math.min(p.hp, p.maxHp);
  p.maxSt = Math.max(1, p.baseMaxSt + totals.maxStBonus);
  p.st = Math.min(p.st, p.maxSt);
  p.salvageMult = totals.salvageMult;
  p.siphonOnKill = totals.siphonOnKill > 0;
  p.flaskHealBonusTotal = totals.flaskHealBonus;
  p.fovBonus = totals.fovBonus;
}
const flaskHeal = () => Math.max(1, FLASK_HEAL + (run.player.flaskHealBonusTotal || 0) -
  ((run.mode === "sector" && run.floorConf && run.floorConf.flaskPenalty) || 0));

function log(msg, cls) {
  run.log.push({ msg, cls: cls || "", t: run.turn });
  if (run.log.length > 40) run.log.shift();
  renderLog();
}
function showMsg(text) { log(text, "sys"); }

/* ------------------------------------------------------------ floor gen */
function genFloor() {
  const f = run.floorConf;
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
    // a last armory before the OVERSEER: guaranteed strong steel
    const tc = run.tiles.get(key(1, R - 2));
    if (tc) {
      tc.rock = false;
      const crng = mulberry32((run.seed ^ 0xbeef) >>> 0);
      run.chests.push({ q: 1, r: R - 2, opened: false, contents: { kind: "item", item: genArmoryItem(crng) } });
    }
    spawnEnemy(f.bossType || "boss", 0, -2);
    run.stairs = null;
    run.eliteTotal = 0;
    run.eliteKilled = 0;
    // a wreck left by a previous attempt on this gate
    if (run.mode === "sector" && f.wreckSouls > 0) {
      const tw = run.tiles.get(key(-1, R - 2));
      if (tw) {
        tw.rock = false;
        run.bloodstain = { q: -1, r: R - 2, souls: f.wreckSouls };
      }
    }
    updateFov();
    return;
  }

  // cavern: noise rock, keep the largest open region
  for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) {
    const d = hexDist(q, r, 0, 0);
    if (d > R) continue;
    const rock = d === R || rng() < (f.rock !== undefined ? f.rock : 0.30);
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
  for (const [type, n] of Object.entries(f.spawn)) {
    for (let i = 0; i < n; i++) {
      const cand = spots.filter(freeFor);
      if (!cand.length) break;
      const k = pick(cand);
      const [q, r] = unkey(k);
      spawnEnemy(type, q, r);
    }
  }
  // Prime promotion: campaign floors promote a classic elite type; keyed
  // sectors promote anyone — every sector needs its Primes to purge
  let eliteN = f.eliteCount || 0;
  const elig = run.enemies.filter(e => run.mode === "sector" || ELITE_TYPES.includes(e.type));
  while (eliteN-- > 0 && elig.length) {
    const e = elig.splice((rng() * elig.length) | 0, 1)[0];
    e.elite = true;
    e.hp = e.maxHp = Math.round(e.maxHp * 1.5);
    e.dmg += 1;
  }
  run.eliteTotal = run.enemies.filter(e => e.elite).length;
  run.eliteKilled = 0;
  // souls shards
  for (let i = 0; i < 3; i++) {
    const cand = floorKeys.filter(k => k !== pk && k !== far && k !== bk &&
      !run.shards.some(s => key(s.q, s.r) === k));
    if (!cand.length) break;
    const [q, r] = unkey(pick(cand));
    run.shards.push({ q, r, souls: 20 });
  }
  // chests: the other reason to explore
  const nChests = f.chests !== undefined ? f.chests : (run.floor >= 3 ? 2 : 1);
  for (let i = 0; i < nChests; i++) {
    const cand = floorKeys.filter(k => {
      const d = dist.get(k);
      return d !== undefined && d >= 4 && k !== far && k !== bk &&
        !run.shards.some(s => key(s.q, s.r) === k) &&
        !run.chests.some(c => key(c.q, c.r) === k);
    });
    if (!cand.length) break;
    const [q, r] = unkey(pick(cand));
    const crng = mulberry32((run.seed ^ (run.floor * 131 + i * 37)) >>> 0);
    run.chests.push({ q, r, opened: false, contents: rollChestContents(crng, run.floor, false) });
  }

  // corrupted terminal: a protocol, if you dare (offers rolled live on entry)
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

  // predecessor's bloodstain (campaign) / your wreck (keyed sector)
  let stainSouls = 0;
  if (run.mode === "sector") {
    stainSouls = f.wreckSouls || 0;
  } else {
    const per = persist();
    if (per.stain && per.stain.floor === run.floor && per.stain.souls > 0) stainSouls = per.stain.souls;
  }
  if (stainSouls > 0) {
    const cand = floorKeys.filter(k => {
      const d = dist.get(k);
      return d !== undefined && d >= 3 && k !== far;
    });
    if (cand.length) {
      const [q, r] = unkey(pick(cand));
      run.bloodstain = { q, r, souls: stainSouls };
    }
  }
  // keyed sectors have no drop shaft — extraction is the only way out
  if (run.mode === "sector") run.stairs = null;
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
  // keyed sectors scale machines by key tier and key mods (bay respawns too)
  if (run.mode === "sector" && run.floorConf) {
    const f = run.floorConf;
    const t = f.tier || 1;
    e.hp = e.maxHp = Math.round(d.hp * (1 + 0.25 * (t - 1)) * (f.hpMult || 1));
    e.dmg = d.dmg + (t >= 3 ? 1 + Math.floor((t - 3) / 3) : 0) + (f.dmgAdd || 0);
  }
  run.enemies.push(e);
  return e;
}

function descend() {
  run.floor++;
  const f = FLOORS[run.floor - 1];
  run.floorConf = { R: f.R, boss: !!f.boss, spawn: f.spawn || {},
    eliteCount: f.elite ? 1 : 0, terminal: !!f.terminal };
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
function playerFovR() {
  const penalty = (run.mode === "sector" && run.floorConf && run.floorConf.fovPenalty) || 0;
  return Math.max(3, FOV_R + (run.player.fovBonus || 0) - penalty);
}
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
  const R = playerFovR();
  for (const t of run.tiles.values()) {
    if (hexDist(t.q, t.r, pq, pr) > R) continue;
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
    // the plasma cleaver carves the target's hex and its two flanking neighbors
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
  // cores trade-off: the sector stirs back to life
  if (run.mode === "sector" || run.floor < 5) {
    const f = run.floorConf;
    const dist = bfsDist(key(p.q, p.r));
    const spots = [...run.tiles.values()].filter(t => {
      const d = dist.get(key(t.q, t.r));
      return !t.rock && d !== undefined && d >= 5 && !occupied(t.q, t.r);
    });
    const rng = mulberry32((run.seed ^ (run.floor * 7919) ^ 0x5f5f) >>> 0);
    let n = 0;
    for (const [type, cnt] of Object.entries(f.spawn)) {
      for (let i = 0; i < cnt && spots.length; i++) {
        if (run.enemies.filter(e => e.type === type).length >= cnt) continue;
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

/* gear-fiddling is free in peace; under hostile eyes it costs the turn */
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
function useConsumable(kind, target) {
  const p = run.player;
  if (run.over || (p.consumables[kind] || 0) <= 0) return false;
  if (kind === "cell") {
    p.st = p.maxSt;
    p.hp = Math.min(p.maxHp, p.hp + 2);
    p.consumables.cell--;
    log("Power cell spent. Capacitors full.", "good");
    sfx("repair");
    endTurn();
    return true;
  }
  if (kind === "dart") {
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
    p.consumables.dart--;
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
    if (run.mode === "sector") {
      const node = profile.atlas.nodes[run.sectorNode];
      if (node) node.wreck = 0;
      syncProfileFromPlayer();
      saveProfile();
    } else {
      const per = persist();
      delete per.stain;
      savePersist(per);
    }
  }
  // chests: items go to the backpack; supplies and orbs increment counters
  const chest = run.chests.find(c => !c.opened && c.q === p.q && c.r === p.r);
  if (chest) {
    chest.opened = true;
    if (chest.contents.kind === "item") {
      const item = chest.contents.item;
      p.items.push(item);
      log("Cache open: " + item.name + " (" + RARITY[item.rarity].name + ").", "good");
      addFloat(p.q, p.r, item.name, RARITY[item.rarity].color);
    } else if (chest.contents.kind === "currency") {
      const label = CURRENCY[chest.contents.orb].name;
      p.currency[chest.contents.orb] = (p.currency[chest.contents.orb] || 0) + chest.contents.n;
      log("Cache open: " + chest.contents.n + "× " + label + ".", "good");
      addFloat(p.q, p.r, "+" + chest.contents.n + " " + label, "#c9a24b");
    } else {
      const label = chest.contents.supply === "dart" ? "Shock Dart" : "Power Cell";
      p.consumables[chest.contents.supply] = (p.consumables[chest.contents.supply] || 0) + chest.contents.n;
      log("Cache open: " + chest.contents.n + "× " + label + ".", "good");
      addFloat(p.q, p.r, "+" + chest.contents.n + " " + label, "#8fe0f0");
    }
    sfx("core");
  }
  const li = run.groundLoot.findIndex(l => l.q === p.q && l.r === p.r);
  if (li >= 0) {
    const l = run.groundLoot[li];
    p.items.push(l.item);
    log("Recovered: " + l.item.name + " (" + RARITY[l.item.rarity].name + ").", "good");
    addFloat(p.q, p.r, l.item.name, RARITY[l.item.rarity].color);
    sfx("core");
    run.groundLoot.splice(li, 1);
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
    souls = Math.round(souls * (1 + (run.player.salvageMult || 0)) *
      (run.mode === "sector" ? 1 + 0.15 * ((run.floorConf.tier || 1) - 1) : 1));
    run.player.souls += souls;
    run.kills++;
    if (run.player.siphonOnKill && run.player.hp > 0) {
      run.player.hp = Math.min(run.player.maxHp, run.player.hp + 1);
      addFloat(run.player.q, run.player.r, "+1", "#5fe0aa");
    }
    // elites drop gear where they fall, plus orbs (juiced keys add more)
    if (e.elite) {
      const lrng = mulberry32((run.seed ^ e.id * 7919) >>> 0);
      run.groundLoot.push({ q: e.q, r: e.r, item: rollItemLoot(lrng, run.floor, true) });
      const bonus = run.mode === "sector" && lrng() < (run.floorConf.lootBonus || 0) ? 1 : 0;
      grantOrbs(lrng, 2 + bonus, run.floor);
    }
    if (souls) addFloat(e.q, e.r, "+" + souls + " cores", "#7fe0f4");
    burst(hexX(e.q, e.r), hexY(e.q, e.r), def.color, 14, 100);
    burst(hexX(e.q, e.r), hexY(e.q, e.r), "#5fd6f0", 5, 60);
    sfx("die");
    run.enemies.splice(run.enemies.indexOf(e), 1);
    // Volatile key mod: the dying machine detonates, and standing next to
    // it is a known cost — resolve the blast before purge credit
    if (run.mode === "sector" && run.floorConf.volatile &&
        hexDist(run.player.q, run.player.r, e.q, e.r) === 1) {
      const pl = run.player;
      pl.hp -= 1;
      hitFlash = 0.3;
      addFloat(pl.q, pl.r, "-1", "#e06060");
      log("The " + def.name + " detonates!", "warn");
      if (pl.hp <= 0) { dieRun(); return; }
    }
    if (e.elite && run.mode === "sector") {
      run.eliteKilled++;
      addFloat(e.q, e.r, `PRIME DOWN ${run.eliteKilled}/${run.eliteTotal}`, "#f0d060");
      if (run.eliteKilled >= run.eliteTotal) sectorComplete();
    }
    if (e.type === "sentinel") gateCleared();
    else if (e.type === "boss") winRun();
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
    e.windupNext = null;
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
    else if (e.type === "sentinel") resolveSentinelStrike(e, hexes, struck);
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
        // lob a charge at your current hex — a 7-hex blast, two turns out.
        // It arcs over rock: cover is no shelter from a Mortar.
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
    case "sentinel": sentinelAct(e, flow, dist); break;
  }
}

/* SENTINEL patterns: long windups whose safe spots sit INSIDE the marked
   pattern. The donut slam leaves coolant-gap pockets you must step into;
   the alternating sweep fires red lanes first and amber lanes one turn
   later, so the dodge is INTO amber, then back into the just-fired red. */
function donutHexes(e) {
  const pockets = new Set([0, 2, 4].map(i =>
    key(e.q + DIRS[i][0] * 2, e.r + DIRS[i][1] * 2)));
  const out = [];
  for (const t of run.tiles.values()) {
    if (t.rock) continue;
    const d = hexDist(t.q, t.r, e.q, e.r);
    if (d < 1 || d > 3) continue;
    const k = key(t.q, t.r);
    if (!pockets.has(k)) out.push(k);
  }
  return out;
}
function laneHexes(e, dirs) {
  const out = [];
  for (const d of dirs) {
    let q = e.q, r = e.r;
    for (let i = 0; i < 4; i++) {
      q += DIRS[d][0]; r += DIRS[d][1];
      const t = run.tiles.get(key(q, r));
      if (!t || t.rock) break;
      out.push(key(q, r));
    }
  }
  return out;
}
function sentinelAct(e, flow, dist) {
  const p = run.player;
  if (e.bossCount >= 3) {
    e.bossCount = 0;
    e.stagger = 2;
    log("The SENTINEL's core overheats.", "good");
    addFloat(e.q, e.r, "overheated", "#f0c060");
    return;
  }
  const cyc = e.atkCycle || 0;
  if (cyc % 3 === 0) {
    if (dist > 3) { stepEnemyToward(e, flow); return; }
    e.state = "windup";
    e.windupTimer = 2;
    e.windupKind = "donut";
    e.windupHexes = donutHexes(e);
    e.atkCycle = cyc + 1;
    e.bossCount++;
    log("The SENTINEL charges a field slam — its coolant gaps stay cold.", "warn");
  } else if (cyc % 3 === 1) {
    if (dist > 4) { stepEnemyToward(e, flow); return; }
    e.state = "windup";
    e.windupTimer = 1;
    e.windupKind = "sweep1";
    e.windupHexes = laneHexes(e, [0, 2, 4]);
    e.windupNext = laneHexes(e, [1, 3, 5]);
    e.atkCycle = cyc + 1;
    e.bossCount++;
    log("Alternating sweep: red lanes fire first, amber lanes follow.", "warn");
  } else {
    const d = axisDir(e.q, e.r, p.q, p.r);
    if (d >= 0 && dist <= 5 && losClear(e.q, e.r, p.q, p.r)) {
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
      e.atkCycle = cyc + 1;
      e.bossCount++;
    } else stepEnemyToward(e, flow);
  }
}
function resolveSentinelStrike(e, hexes, struck) {
  const p = run.player;
  if (e.windupKind === "sweep1") {
    if (struck) hurtPlayer(e, e.dmg);
    // the amber half spins up the moment the red half fires
    e.state = "windup";
    e.windupTimer = 1;
    e.windupKind = "sweep2";
    e.windupHexes = e.windupNext && e.windupNext.length ? e.windupNext : laneHexes(e, [1, 3, 5]);
    e.windupNext = null;
    return;
  }
  if (e.windupKind === "charge") {
    let landing = null;
    for (const k of hexes) {
      const [q, r] = unkey(k);
      if (!occupied(q, r)) landing = [q, r];
      if (q === p.q && r === p.r) break;
    }
    if (struck) hurtPlayer(e, e.dmg - 1);
    if (landing) { e.q = landing[0]; e.r = landing[1]; }
    return;
  }
  if (struck) hurtPlayer(e, e.dmg + (e.windupKind === "donut" ? 1 : 0));
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
    // cleave: the player's hex and its two neighbors around the OVERSEER
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
    // fabricate two units
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
  if (run.mode === "sector") {
    // the key is already spent; the frame is rebuilt at the Bay, but the
    // cores stay in the node as a wreck until you re-key it
    savePersist(per);
    const node = profile.atlas.nodes[run.sectorNode];
    if (node && node.state !== "cleared") node.wreck = (node.wreck || 0) + p.souls;
    const lost = p.souls;
    p.souls = 0;
    syncProfileFromPlayer();
    saveProfile();
    document.getElementById("death-souls").textContent = lost > 0
      ? lost + " cores went down with the frame — socket another key into that node to reclaim the wreck."
      : "The key burns out with the frame. The sector stays sealed.";
    document.getElementById("death-stats").textContent =
      `T${run.floorConf.tier} ${run.floorConf.biomeName} · ${run.kills} scrapped · cycle ${run.turn}`;
    document.getElementById("death-retry").textContent = "Return to the Bay";
  } else {
    per.best = Math.max(per.best || 0, run.floor);
    if (p.souls > 0) per.stain = { floor: run.floor, souls: p.souls };
    savePersist(per);
    document.getElementById("death-souls").textContent =
      p.souls > 0 ? p.souls + " cores scattered in Sector " + run.floor + " — reclaim them from your wreck."
                  : "You carried nothing worth salvaging.";
    document.getElementById("death-stats").textContent =
      "Sector " + run.floor + " · " + run.kills + " scrapped · cycle " + run.turn;
    document.getElementById("death-retry").textContent = "Reinitialize";
  }
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
  const p = run.player;
  // the OVERSEER's death cracks the Foundry open: the character you
  // finished the prologue with becomes your persistent endgame frame
  if (run.mode === "campaign") {
    const first = !profile || !profile.atlas.unlocked;
    if (!profile) {
      profile = { v: 3, character: snapshotCharacter(p),
        atlas: { seed: (Math.random() * 1e9) | 0, unlocked: false, nodes: {}, keys: [], tierCap: 4 } };
    } else {
      profile.character = snapshotCharacter(p);
    }
    profile.atlas.unlocked = true;
    if (!profile.atlas.nodes["0,0"]) initAtlas();
    if (first) for (let i = 0; i < 3; i++) profile.atlas.keys.push(makeKey(1));
    saveProfile();
  }
  document.getElementById("win-again").textContent =
    profile && profile.atlas.unlocked ? "Enter the Foundry" : "Descend again";
  document.getElementById("win-stats").textContent =
    run.kills + " scrapped · " + run.turn + " cycles · " + p.souls + " cores unspent";
  document.getElementById("win").classList.remove("hidden");
}

/* ====================== THE FOUNDRY: overworld play ===================== */
function snapshotCharacter(p) {
  return {
    baseMaxHp: p.baseMaxHp, baseMaxSt: p.baseMaxSt, bonusDmg: p.bonusDmg,
    maxFlask: p.maxFlask, souls: p.souls,
    items: p.items, equip: p.equip, currency: p.currency, consumables: p.consumables,
    upgrades: bought,
  };
}
function characterToPlayer(c) {
  return {
    q: 0, r: 0, hp: 1, st: 1,
    baseMaxHp: c.baseMaxHp, baseMaxSt: c.baseMaxSt, bonusDmg: c.bonusDmg,
    items: c.items, equip: c.equip, currency: c.currency, consumables: c.consumables,
    flask: c.maxFlask, maxFlask: c.maxFlask, souls: c.souls,
    parry: false, parryHit: false, dead: false,
  };
}
// the live player and profile.character share item/equip/currency refs;
// this refreshes the scalar fields before a save
function syncProfileFromPlayer() {
  if (!profile || !run || run.mode === "campaign") return;
  const p = run.player, c = profile.character;
  c.baseMaxHp = p.baseMaxHp; c.baseMaxSt = p.baseMaxSt; c.bonusDmg = p.bonusDmg;
  c.maxFlask = p.maxFlask; c.souls = p.souls;
  c.items = p.items; c.equip = p.equip; c.currency = p.currency; c.consumables = p.consumables;
  c.upgrades = bought;
}
function initAtlas() {
  profile.atlas.nodes["0,0"] = { state: "hub" };
  for (const [dq, dr] of DIRS) revealNode(dq, dr);
}
function revealNode(q, r) {
  const k = key(q, r);
  if (profile.atlas.nodes[k]) return;
  const rng = mulberry32((profile.atlas.seed ^ (q * 73856093) ^ (r * 19349663)) >>> 0);
  const biomes = Object.keys(BIOMES);
  // nodes have a biome but no tier: the socketed key sets the danger
  profile.atlas.nodes[k] = {
    state: "frontier", biome: biomes[(rng() * biomes.length) | 0], wreck: 0,
  };
}
function enterOverworld() {
  if (!profile || !profile.atlas.unlocked) return false;
  bought = profile.character.upgrades || {};
  run = {
    mode: "overworld", floorConf: null, sectorNode: null,
    eliteTotal: 0, eliteKilled: 0,
    seed: 0, floor: 0,
    player: characterToPlayer(profile.character),
    tiles: new Map(), enemies: [], shards: [], chests: [], groundLoot: [],
    stairs: null, bay: null, bloodstain: null, terminal: null,
    turn: 0, kills: 0, over: false, won: false, log: [],
  };
  recalc();
  const p = run.player;
  p.hp = p.maxHp; p.st = p.maxSt; p.flask = p.maxFlask;
  ui.screen = "overworld";
  ui.rollMode = false; ui.throwDart = false; ui.walking = null;
  document.body.classList.add("overworld");
  for (const id of ["menu", "death", "win", "shop", "terminal", "inv", "node"])
    document.getElementById(id).classList.add("hidden");
  cam.x = 0; cam.y = 0; cam.tx = 0; cam.ty = 0; cam.zoom = 1;
  log("The Bay. Socket a Sector Key into a frontier node.", "sys");
  renderLog();
  refreshHud();
  saveProfile();
  return true;
}
function enterNode(q, r, keyId) {
  const nk = key(q, r);
  const node = profile.atlas.nodes[nk];
  if (!node || (node.state !== "frontier" && node.state !== "gate")) return false;
  const isGate = node.state === "gate";
  const ki = profile.atlas.keys.findIndex(kk => kk.id === keyId);
  if (ki < 0) return false;
  if (isGate && profile.atlas.keys[ki].tier !== node.band) {
    log(`The gate only accepts a T${node.band} key.`, "warn");
    return false;
  }
  const skey = profile.atlas.keys.splice(ki, 1)[0];
  const tier = skey.tier;   // the key alone sets the sector's tier
  // aggregate the key's sector modifiers
  const mod = { spawnMult: 1, hpMult: 1, dmgAdd: 0, extraElites: 0,
    fovPenalty: 0, flaskPenalty: 0, volatile: false };
  for (const a of skey.affixes) KEY_MOD_BY[a.mod].apply(mod);
  const quant = keyQuant(skey);
  run.mode = "sector";
  run.sectorNode = nk;
  run.seed = (profile.atlas.seed ^ (q * 73856093) ^ (r * 19349663) ^ (tier * 2654435761)) >>> 0;
  run.floor = tier + 1;   // drives loot depth (affix tiers, rarity weights)
  run.over = false; run.won = false; run.turn = 0; run.kills = 0;
  if (isGate) {
    // gate arena: open ground, a few pillars, one SENTINEL
    run.floorConf = {
      R: 9, boss: true, bossType: "sentinel", spawn: {},
      eliteCount: 0, terminal: false,
      tier, biomeName: "Sector Gate",
      hpMult: mod.hpMult, dmgAdd: mod.dmgAdd,
      fovPenalty: mod.fovPenalty, flaskPenalty: mod.flaskPenalty,
      volatile: mod.volatile, lootBonus: quant,
      wreckSouls: node.wreck || 0,
    };
  } else {
    const biome = BIOMES[node.biome];
    const spawn = {};
    for (const [type, n] of Object.entries(biome.spawn(tier))) spawn[type] = Math.round(n * mod.spawnMult);
    run.floorConf = {
      R: 8 + (tier >= 3 ? 1 : 0),
      spawn,
      rock: biome.rock,
      chests: (biome.chests || 1) + (tier >= 3 ? 1 : 0) + Math.floor(quant / 0.25),
      terminal: mulberry32((run.seed ^ 0x7777) >>> 0)() < 0.4,
      eliteCount: 1 + (tier >= 3 ? 1 : 0) + mod.extraElites,
      tier, biomeName: biome.name,
      hpMult: mod.hpMult, dmgAdd: mod.dmgAdd,
      fovPenalty: mod.fovPenalty, flaskPenalty: mod.flaskPenalty,
      volatile: mod.volatile, lootBonus: quant,
      wreckSouls: node.wreck || 0,
    };
  }
  genFloor();
  ui.screen = "game";
  ui.rollMode = false; ui.throwDart = false; ui.walking = null;
  document.body.classList.remove("overworld");
  document.getElementById("node").classList.add("hidden");
  centerCam();
  cam.x = hexX(run.player.q, run.player.r);
  cam.y = hexY(run.player.q, run.player.r);
  invalidateFloorCaches();
  const modNames = skey.affixes.map(a => KEY_MOD_BY[a.mod].name).join(", ");
  if (isGate) {
    log(`SECTOR GATE [T${tier}]${modNames ? " [" + modNames + "]" : ""}. The SENTINEL wakes.`, "sys");
  } else {
    log(`T${tier} ${run.floorConf.biomeName}${modNames ? " [" + modNames + "]" : ""}. Purge ${run.eliteTotal} Prime unit${run.eliteTotal === 1 ? "" : "s"}.`, "sys");
  }
  syncProfileFromPlayer();
  saveProfile();   // the key is spent the moment you jack in
  refreshHud();
  return true;
}
function sectorComplete() {
  const node = profile.atlas.nodes[run.sectorNode];
  if (!node || node.state === "cleared") return;
  node.state = "cleared";
  node.clearedTier = run.floorConf.tier;
  const [q, r] = unkey(run.sectorNode);
  for (const [dq, dr] of DIRS) revealNode(q + dq, r + dr);
  // key sustain: always at least one key back, at tier or tier+1; juiced
  // keys raise the chance of a second, and drops can come pre-modified
  const t = run.floorConf.tier;
  const drops = 1 + (craftRng() < 0.3 * run.eliteTotal + (run.floorConf.lootBonus || 0) ? 1 : 0);
  for (let i = 0; i < drops; i++) {
    const kt = clamp(t + (craftRng() < 0.35 ? 1 : 0), 1, atlasCap());
    const drop = makeKey(kt);
    if (kt >= 2 && craftRng() < 0.2) { drop.rarity = "magic"; addKeyMod(craftRng, drop); }
    profile.atlas.keys.push(drop);
    log(`${keyDisplayName(drop)} recovered.`, "good");
  }
  // purging at the current cap wakes a SENTINEL gate somewhere past the frontier
  if (t >= atlasCap() && atlasCap() < TIER_CAP &&
      !Object.values(profile.atlas.nodes).some(n => n.state === "gate")) {
    spawnGateNode(run.sectorNode);
  }
  log("SECTOR PURGED — extraction enabled.", "sys");
  addFloat(run.player.q, run.player.r, "SECTOR PURGED", "#5fe0aa");
  sfx("stairs");
  syncProfileFromPlayer();
  saveProfile();
  refreshHud();
}
function spawnGateNode(nearKey) {
  const [q0, r0] = unkey(nearKey);
  const seen = new Set([nearKey]);
  const queue = [[q0, r0]];
  while (queue.length) {
    const [q, r] = queue.shift();
    for (const [dq, dr] of DIRS) {
      const nk = key(q + dq, r + dr);
      if (seen.has(nk)) continue;
      seen.add(nk);
      if (!profile.atlas.nodes[nk]) {
        profile.atlas.nodes[nk] = { state: "gate", band: atlasCap(), wreck: 0 };
        log(`A SENTINEL gate surfaces on the frontier — arm it with a T${atlasCap()} key.`, "sys");
        return;
      }
      queue.push([q + dq, r + dr]);
    }
  }
}
function gateCleared() {
  const node = profile.atlas.nodes[run.sectorNode];
  if (!node || node.state === "cleared") return;
  node.state = "cleared";
  node.clearedTier = run.floorConf.tier;
  const [q, r] = unkey(run.sectorNode);
  for (const [dq, dr] of DIRS) revealNode(q + dq, r + dr);
  const oldCap = profile.atlas.tierCap;
  profile.atlas.tierCap = Math.min(TIER_CAP, oldCap + 4);
  for (let i = 0; i < 2; i++)
    profile.atlas.keys.push(makeKey(Math.min(oldCap + 1, profile.atlas.tierCap)));
  grantOrbs(craftRng, 3 + (craftRng() < (run.floorConf.lootBonus || 0) ? 1 : 0), run.floor);
  log(`THE GATE FALLS. Sector Keys up to T${profile.atlas.tierCap} now drop. Extraction enabled.`, "sys");
  addFloat(run.player.q, run.player.r, "GATE FALLS", "#5fe0aa");
  sfx("win");
  syncProfileFromPlayer();
  saveProfile();
  refreshHud();
}
function extractToOverworld() {
  if (run.mode !== "sector") return false;
  const node = profile.atlas.nodes[run.sectorNode];
  if (node && node.state === "cleared") node.wreck = 0;  // unclaimed wreck in a purged node is gone
  run.mode = "overworld";
  run.sectorNode = null;
  run.enemies = [];
  run.over = false;
  const p = run.player;
  p.hp = p.maxHp; p.st = p.maxSt; p.flask = p.maxFlask; p.parry = false; p.dead = false;
  ui.screen = "overworld";
  ui.rollMode = false; ui.throwDart = false; ui.walking = null;
  document.body.classList.add("overworld");
  cam.tx = 0; cam.ty = 0;
  log("Extraction. The Bay repairs your frame.", "good");
  syncProfileFromPlayer();
  saveProfile();
  refreshHud();
  return true;
}
function fabricateKey(tier) {
  const p = run.player;
  const cost = keyFabCost(tier);
  if (tier < 1 || tier > atlasCap() || p.souls < cost) return false;
  p.souls -= cost;
  profile.atlas.keys.push(makeKey(tier));
  log(`The Bay fabricates a T${tier} Sector Key (${cost} cores).`, "good");
  sfx("core");
  syncProfileFromPlayer();
  saveProfile();
  return true;
}
/* the same currency orbs that craft gear also craft keys */
function canApplyOrbKey(kind, k) {
  if (!k) return { ok: false, reason: "No key." };
  switch (kind) {
    case "transmute":
    case "alch":
      return k.rarity === "normal" ? { ok: true } : { ok: false, reason: "Needs a Normal key." };
    case "aug":
      if (k.rarity !== "magic") return { ok: false, reason: "Needs a Magic key." };
      return k.affixes.length < KEY_MOD_CAP.magic ? { ok: true } : { ok: false, reason: "No room for another modifier." };
    case "regal":
      return k.rarity === "magic" ? { ok: true } : { ok: false, reason: "Needs a Magic key." };
    case "exalt":
      if (k.rarity !== "rare") return { ok: false, reason: "Needs a Rare key." };
      return k.affixes.length < KEY_MOD_CAP.rare ? { ok: true } : { ok: false, reason: "No room for another modifier." };
    case "chaos":
      if (k.rarity !== "rare") return { ok: false, reason: "Needs a Rare key." };
      return k.affixes.length ? { ok: true } : { ok: false, reason: "No modifiers to reroll." };
  }
  return { ok: false, reason: "Unknown orb." };
}
function applyOrbToKey(kind, keyId) {
  const p = run.player;
  const k = profile.atlas.keys.find(x => x.id === keyId);
  if ((p.currency[kind] || 0) <= 0) return false;
  const check = canApplyOrbKey(kind, k);
  if (!check.ok) { log(check.reason, "warn"); return false; }
  p.currency[kind]--;
  switch (kind) {
    case "transmute":
      k.rarity = "magic";
      addKeyMod(craftRng, k);
      break;
    case "aug":
      addKeyMod(craftRng, k);
      break;
    case "alch": {
      k.rarity = "rare";
      nameRareKey(craftRng, k);
      const n = 3 + (craftRng() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) addKeyMod(craftRng, k);
      break;
    }
    case "regal":
      k.rarity = "rare";
      nameRareKey(craftRng, k);
      addKeyMod(craftRng, k);
      break;
    case "exalt":
      addKeyMod(craftRng, k);
      break;
    case "chaos": {
      // always a different mod: the removed one is excluded from the re-roll
      const removed = k.affixes.splice((craftRng() * k.affixes.length) | 0, 1)[0];
      const pool = KEY_MODS.filter(m => m.key !== removed.mod && !k.affixes.some(a => a.mod === m.key));
      if (pool.length) {
        const m = pool[(craftRng() * pool.length) | 0];
        k.affixes.push({ id: ++itemSeq, mod: m.key });
      }
      break;
    }
  }
  log(CURRENCY[kind].name + " → " + keyDisplayName(k) + ".", "good");
  sfx("core");
  syncProfileFromPlayer();
  saveProfile();
  return true;
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
  const R = run.floorConf.R;
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

  if (ui.screen === "overworld" && profile) {
    renderOverworld(now / 1000);
    requestAnimationFrame(render);
    return;
  }

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

  /* next-wave telegraphs (amber): fire one turn after the red wave */
  for (const e of run.enemies) {
    if (!e.windupNext) continue;
    for (const k of e.windupNext) {
      if (!visible.has(k)) continue;
      const [q, r] = unkey(k);
      hexPath(ctx, hexX(q, r), hexY(q, r), 0.88);
      ctx.strokeStyle = "rgba(230,170,70,0.6)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

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
  if (ui.throwDart) {
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

/* the Foundry overworld: each hex is a sealed sector node */
function renderOverworld(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#080d12";
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(cam.zoom * DPR, 0, 0, cam.zoom * DPR,
    (W / 2 - cam.x * cam.zoom) * DPR, (H / 2 - cam.y * cam.zoom) * DPR);
  const nodes = profile.atlas.nodes;
  const pulse = 0.55 + 0.25 * Math.sin(t * 3);
  // sealed space just past the frontier, hinted
  const ghost = new Set();
  for (const k in nodes) {
    const [q, r] = unkey(k);
    for (const [dq, dr] of DIRS) {
      const nk = key(q + dq, r + dr);
      if (!nodes[nk]) ghost.add(nk);
    }
  }
  for (const k of ghost) {
    const [q, r] = unkey(k);
    hexPath(ctx, hexX(q, r), hexY(q, r), 0.9);
    ctx.strokeStyle = "#141e28";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.textAlign = "center";
  for (const k in nodes) {
    const n = nodes[k];
    const [q, r] = unkey(k);
    const x = hexX(q, r), y = hexY(q, r);
    hexPath(ctx, x, y, 0.92);
    if (n.state === "hub") {
      ctx.fillStyle = "#12333e";
      ctx.fill();
      hexPath(ctx, x, y, 0.92);
      ctx.strokeStyle = "#4fd6e8";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#7fe6f4";
      ctx.font = "bold 9px monospace";
      ctx.fillText("BAY", x, y + 3);
    } else if (n.state === "gate") {
      ctx.fillStyle = "#2a1218";
      ctx.fill();
      hexPath(ctx, x, y, 0.92);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = "#ff5a5a";
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ff8a8a";
      ctx.font = "bold 9px monospace";
      ctx.fillText("GATE", x, y);
      ctx.font = "8px monospace";
      ctx.fillText("T" + n.band, x, y + 10);
      if (n.wreck > 0) {
        ctx.fillStyle = "#7fe0f4";
        ctx.font = "8px monospace";
        ctx.fillText("✕ " + n.wreck, x, y + 19);
      }
    } else if (n.state === "cleared") {
      ctx.fillStyle = "#0e1a15";
      ctx.fill();
      hexPath(ctx, x, y, 0.92);
      ctx.strokeStyle = "#2f5548";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "#3fa080";
      ctx.font = "9px monospace";
      ctx.fillText((n.clearedTier ? "T" + n.clearedTier + " " : "") + "✓", x, y + 3);
    } else {
      const col = BIOMES[n.biome].color;
      ctx.fillStyle = "#0f1a22";
      ctx.fill();
      hexPath(ctx, x, y, 0.92);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.font = "bold 9px monospace";
      ctx.fillText(BIOMES[n.biome].abbr, x, y + 3);
      if (n.wreck > 0) {
        ctx.fillStyle = "#7fe0f4";
        ctx.font = "8px monospace";
        ctx.fillText("✕ " + n.wreck, x, y + 13);
      }
    }
  }
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
  const big = e.type === "boss" ? 1.0 : e.type === "sentinel" ? 0.95 : e.type === "crusher" ? 0.78 : 0.55;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  // facing wedge
  const ang = Math.atan2(hexY(...DIRS[e.dir]), hexX(...DIRS[e.dir]));
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
    // reactor sigil
    ctx.fillStyle = "#ffe07a";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("◈", pos.x, pos.y - HEX * 0.9);
  } else if (e.type === "sentinel") {
    ctx.fillStyle = "#ff8aa0";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⬢", pos.x, pos.y - HEX * 0.9);
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
const ui = { screen: "game", rollMode: false, throwDart: false, walking: null, keys: {} };

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
  document.getElementById("loc-label").textContent =
    ui.screen === "overworld" ? "The Foundry"
    : run.mode === "sector" ? `T${run.floorConf.tier} ${run.floorConf.biomeName}`
    : "Sector " + run.floor;
  const wc = activeWeaponItem();
  const wnEl = document.getElementById("weapon-name");
  wnEl.textContent = wc ? wc.name : "Bare Fists";
  wnEl.style.color = wc ? RARITY[wc.rarity].color : "";

  const rollBtn = document.getElementById("btn-roll");
  rollBtn.textContent = p.rollCost === 2 ? "Dash" : `Dash (${p.rollCost})`;
  rollBtn.classList.toggle("active", ui.rollMode);
  rollBtn.disabled = p.st < p.rollCost || run.over;
  document.getElementById("btn-parry").disabled = p.st < p.parryCost || run.over;
  document.getElementById("btn-flask").disabled = p.flask <= 0 || p.hp >= p.maxHp || run.over;
  const b = run.bay;
  document.getElementById("btn-rest").classList.toggle("hidden",
    !b || b.used || hexDist(p.q, p.r, b.q, b.r) > 1 || run.over);
  const ex = document.getElementById("btn-extract");
  const inSector = run.mode === "sector" && ui.screen === "game";
  ex.classList.toggle("hidden", !inSector || run.over);
  if (inSector) {
    const purged = profile && profile.atlas.nodes[run.sectorNode] &&
      profile.atlas.nodes[run.sectorNode].state === "cleared";
    ex.classList.toggle("purged", !!purged);
    if (ex.dataset.arm !== "1") ex.textContent = purged ? "Extract ▸" : "Extract";
  } else {
    ex.dataset.arm = "";
  }
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
      if (run.mode !== "campaign") { syncProfileFromPlayer(); saveProfile(); }
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

/* ------- corrupted terminal: fabricate corrupted rare gear ------- */
function showTerminal() {
  const p = run.player;
  const rng = mulberry32((run.seed ^ (run.floor * 104729)) >>> 0);
  const offers = [genCorruptedItem(rng, run.floor), genCorruptedItem(rng, run.floor)];
  const box = document.getElementById("terminal-items");
  box.innerHTML = "";
  for (const item of offers) {
    const base = BASE_TYPES[item.base];
    const mods = item.affixes.map(a =>
      `<span style="color:${a.kind === "corrupt" ? "#ff6a52" : "#9fb2c0"}">${describeEffect(a.effect)}</span>`).join(" · ");
    const el = document.createElement("button");
    el.className = "shop-item";
    el.innerHTML = `<b style="color:${RARITY.rare.color}">${item.name}</b>` +
      `<span>${base.name} (${SLOT_LABEL[base.slot]}) — ${mods}<br>` +
      `<i style="color:#ff6a52">Corrupted: orbs are rejected.</i></span>`;
    el.addEventListener("click", () => {
      p.items.push(item);
      run.terminal.used = true;
      log("Terminal accepts. " + item.name + " fabricated — corrupted, no take-backs.", "sys");
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

/* ------- Equipment: slots, backpack, currency ------- */
function gearOpen() { return !document.getElementById("inv").classList.contains("hidden"); }
function openGear() { refreshGear(); refreshHud(); document.getElementById("inv").classList.remove("hidden"); }
function closeGear() {
  document.getElementById("inv").classList.add("hidden");
  if (run && run.mode !== "campaign") { syncProfileFromPlayer(); saveProfile(); }
}

// which orbs make sense to offer on this item right now
function orbChoices(item) {
  if (item.corrupted || item.rarity === "unique") return [];
  if (item.rarity === "normal") return ["transmute", "alch"];
  if (item.rarity === "magic") return ["aug", "regal"];
  if (item.rarity === "rare") return ["exalt", "chaos"];
  return [];
}
function itemModsHTML(item) {
  const base = BASE_TYPES[item.base];
  let html = "";
  if (base.slot === "weapon") {
    html += `<span class="mod implicit">${base.dmg} dmg · ${base.atkCost} power/strike · +${base.bsBonus} rear-strike` +
      `${base.cleave ? " · cleaves" : ""}${base.reach ? " · reach" : ""}</span>`;
  }
  if (Object.keys(base.implicit).length) {
    html += `<span class="mod implicit">${describeEffect(base.implicit)}</span>`;
  }
  for (const a of item.affixes) {
    const cls = a.kind === "corrupt" ? "corrupt" : a.kind === "unique" ? "unique" : "affix";
    html += `<span class="mod ${cls}">${describeEffect(a.effect)}${a.kind === "corrupt" ? " (corrupted)" : ""}</span>`;
  }
  if (item.lore) html += `<span class="mod lore">${item.lore}</span>`;
  return html;
}
function itemCardEl(item, equippedSlot) {
  const p = run.player;
  const base = BASE_TYPES[item.base];
  const el = document.createElement("div");
  el.className = "item-card" + (equippedSlot ? " equipped" : "");
  const info = document.createElement("div");
  info.className = "item-info";
  info.innerHTML =
    `<b style="color:${RARITY[item.rarity].color}">${item.name}</b>` +
    `<span class="item-base">${base.name} · ${SLOT_LABEL[base.slot]} · ${RARITY[item.rarity].name}` +
    `${item.corrupted ? ' · <i style="color:#ff6a52">Corrupted</i>' : ""}</span>` +
    itemModsHTML(item);
  el.appendChild(info);
  const btns = document.createElement("div");
  btns.className = "item-btns";
  if (equippedSlot) {
    const un = document.createElement("button");
    un.textContent = "Unequip";
    un.addEventListener("click", () => { unequipItem(equippedSlot); refreshGear(); refreshHud(); });
    btns.appendChild(un);
  } else {
    const eq = document.createElement("button");
    eq.textContent = "Equip";
    eq.addEventListener("click", () => { if (equipItem(item.id)) { refreshGear(); refreshHud(); } });
    btns.appendChild(eq);
    const drop = document.createElement("button");
    drop.textContent = "Drop";
    drop.addEventListener("click", () => { if (dropItem(item.id)) { refreshGear(); refreshHud(); } });
    btns.appendChild(drop);
  }
  for (const kind of orbChoices(item)) {
    const n = p.currency[kind] || 0;
    const b = document.createElement("button");
    b.className = "orb-btn";
    b.textContent = CURRENCY[kind].name.replace("Orb of ", "").replace(" Orb", "") + ` (${n})`;
    b.title = CURRENCY[kind].desc;
    b.disabled = n <= 0 || !canApplyOrb(kind, item).ok;
    b.addEventListener("click", () => { if (applyOrb(kind, item.id)) { refreshGear(); refreshHud(); } });
    btns.appendChild(b);
  }
  el.appendChild(btns);
  return el;
}
function refreshGearSlots() {
  const el = document.getElementById("gear-slots");
  el.innerHTML = "";
  for (const slot of SLOTS) {
    const item = equippedItem(slot);
    if (item) {
      el.appendChild(itemCardEl(item, slot));
    } else {
      const empty = document.createElement("div");
      empty.className = "item-card empty-slot";
      empty.textContent = SLOT_LABEL[slot] + " — empty" + (slot === "weapon" ? " (bare fists)" : "");
      el.appendChild(empty);
    }
  }
}
function refreshGearPack() {
  const p = run.player;
  const el = document.getElementById("gear-pack");
  const pack = p.items.filter(i => !isEquipped(i.id));
  if (!pack.length) { el.innerHTML = '<div class="gear-empty">Backpack empty.</div>'; return; }
  el.innerHTML = "";
  for (const item of pack) el.appendChild(itemCardEl(item, null));
}
function refreshGearCurrency() {
  const p = run.player;
  const el = document.getElementById("gear-currency");
  el.innerHTML = "";
  let any = false;
  for (const kind in CURRENCY) {
    const n = p.currency[kind] || 0;
    if (!n) continue;
    any = true;
    const row = document.createElement("div");
    row.className = "currency-row";
    row.innerHTML = `<b>${CURRENCY[kind].name} ×${n}</b><span>${CURRENCY[kind].desc}</span>`;
    el.appendChild(row);
  }
  if (!any) el.innerHTML = '<div class="gear-empty">No orbs. Caches and elite machines carry them.</div>';
}
function keyOrbChoices(k) {
  if (k.rarity === "normal") return ["transmute", "alch"];
  if (k.rarity === "magic") return ["aug", "regal"];
  if (k.rarity === "rare") return ["exalt", "chaos"];
  return [];
}
function refreshGearKeys() {
  const p = run.player;
  const h = document.getElementById("gear-keys-h");
  const el = document.getElementById("gear-keys");
  const show = !!(profile && profile.atlas && profile.atlas.unlocked);
  h.classList.toggle("hidden", !show);
  el.classList.toggle("hidden", !show);
  if (!show) return;
  el.innerHTML = "";
  if (!profile.atlas.keys.length) {
    el.innerHTML = '<div class="gear-empty">No keys. Purge sectors for drops, or fabricate at the Bay.</div>';
    return;
  }
  for (const k of profile.atlas.keys) {
    const card = document.createElement("div");
    card.className = "item-card";
    let mods = "";
    for (const a of k.affixes) {
      const m = KEY_MOD_BY[a.mod];
      mods += `<span class="mod affix">${m.desc} · +${Math.round(m.quant * 100)}% loot</span>`;
    }
    card.innerHTML = `<div class="item-info">` +
      `<b style="color:${RARITY[k.rarity].color}">${keyDisplayName(k)}</b>` +
      `<span class="item-base">Sector Key · Tier ${k.tier} · ${RARITY[k.rarity].name}` +
      (k.affixes.length ? ` · +${Math.round(keyQuant(k) * 100)}% loot` : "") + `</span>` + mods + `</div>`;
    const btns = document.createElement("div");
    btns.className = "item-btns";
    for (const kind of keyOrbChoices(k)) {
      const n = p.currency[kind] || 0;
      const b = document.createElement("button");
      b.className = "orb-btn";
      b.textContent = CURRENCY[kind].name.replace("Orb of ", "").replace(" Orb", "") + ` (${n})`;
      b.title = CURRENCY[kind].desc;
      b.disabled = n <= 0 || !canApplyOrbKey(kind, k).ok;
      b.addEventListener("click", () => { if (applyOrbToKey(kind, k.id)) { refreshGear(); refreshHud(); } });
      btns.appendChild(b);
    }
    card.appendChild(btns);
    el.appendChild(card);
  }
}
function refreshGearTools() {
  const p = run.player;
  const el = document.getElementById("gear-tools");
  el.innerHTML = "";
  const rows = [
    { kind: "dart", label: "Shock Dart", desc: CONSUMABLE_DESC.dart, n: p.consumables.dart || 0 },
    { kind: "cell", label: "Power Cell", desc: CONSUMABLE_DESC.cell, n: p.consumables.cell || 0 },
  ];
  for (const row of rows) {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `<div class="item-info"><b>${row.label} ×${row.n}</b><span>${row.desc}</span></div>`;
    const btns = document.createElement("div"); btns.className = "item-btns";
    const btn = document.createElement("button");
    if (row.kind === "dart") {
      btn.textContent = "Throw";
      btn.disabled = row.n <= 0 || run.over;
      btn.addEventListener("click", () => {
        ui.throwDart = true;
        closeGear();
        showMsg("Pick a target down a clear lane.");
        refreshHud();
      });
    } else {
      btn.textContent = "Use";
      btn.disabled = row.n <= 0 || run.over;
      btn.addEventListener("click", () => { useConsumable("cell"); closeGear(); refreshHud(); });
    }
    btns.appendChild(btn); card.appendChild(btns);
    el.appendChild(card);
  }
}
function refreshGear() {
  document.getElementById("gear-note").textContent = inCombat()
    ? "⚠ Hostiles in sensor range — equipping, unequipping or crafting will cost your turn."
    : "No contacts. Gear changes are free.";
  refreshGearSlots();
  refreshGearPack();
  refreshGearCurrency();
  refreshGearKeys();
  refreshGearTools();
}
document.getElementById("btn-gear").addEventListener("click", () => {
  if (gearOpen()) closeGear(); else openGear();
});
document.getElementById("inv-close").addEventListener("click", closeGear);

/* ------- Foundry node panel: inspect a sector, socket a key ------- */
function openNodePanel(q, r) {
  const nk = key(q, r);
  const node = profile.atlas.nodes[nk];
  if (!node) return;
  const box = document.getElementById("node-actions");
  const title = document.getElementById("node-title");
  const desc = document.getElementById("node-desc");
  box.innerHTML = "";
  if (node.state === "hub") {
    title.textContent = "The Bay";
    desc.textContent = `Home dock. Cores buy fresh Sector Keys up to T${atlasCap()}. You hold ${run.player.souls} cores.`;
    for (let t = 1; t <= atlasCap(); t++) {
      const cost = keyFabCost(t);
      const b = document.createElement("button");
      b.className = "shop-item";
      b.disabled = run.player.souls < cost;
      b.innerHTML = `<b style="color:${tierColor(t)}">Fabricate T${t} Sector Key</b><em>${cost} cores</em>`;
      b.addEventListener("click", () => { if (fabricateKey(t)) { openNodePanel(q, r); refreshHud(); } });
      box.appendChild(b);
    }
  } else if (node.state === "gate") {
    title.textContent = `SECTOR GATE — the SENTINEL`;
    desc.textContent = `A gate guardian seals the deeper Foundry.` +
      (node.wreck > 0 ? ` Your wreck holds ${node.wreck} cores in its arena.` : "") +
      ` Arm it with a T${node.band} key — victory unlocks Sector Keys to T${Math.min(TIER_CAP, node.band + 4)}.`;
    const fits = profile.atlas.keys.filter(kk => kk.tier === node.band);
    for (const kk of fits) {
      const mods = kk.affixes.map(a => KEY_MOD_BY[a.mod].desc).join(" · ");
      const b = document.createElement("button");
      b.className = "shop-item";
      b.innerHTML = `<b style="color:${RARITY[kk.rarity].color}">Arm with ${keyDisplayName(kk)}</b>` +
        `<span>${mods || "no modifiers"}</span><em>+${Math.round(keyQuant(kk) * 100)}% loot</em>`;
      b.addEventListener("click", () => enterNode(q, r, kk.id));
      box.appendChild(b);
    }
    if (!fits.length) {
      const none = document.createElement("p");
      none.className = "stats";
      none.textContent = `No T${node.band} key. Purge T${node.band} sectors or fabricate one at the Bay.`;
      box.appendChild(none);
    }
  } else if (node.state === "cleared") {
    title.textContent = BIOMES[node.biome].name;
    desc.textContent = `Purged at T${node.clearedTier || "?"} and sealed. Nothing moves in there anymore.`;
  } else {
    title.textContent = BIOMES[node.biome].name;
    desc.textContent = BIOMES[node.biome].desc +
      (node.wreck > 0 ? ` Your wreck holds ${node.wreck} cores in there.` : "") +
      " Any Sector Key opens it — the key sets the danger and the reward.";
    // plain keys grouped by tier; modified keys listed individually
    const normals = {};
    const modded = [];
    for (const kk of profile.atlas.keys) {
      if (kk.rarity === "normal") (normals[kk.tier] = normals[kk.tier] || []).push(kk);
      else modded.push(kk);
    }
    let offered = 0;
    for (const t of Object.keys(normals).sort((a, b) => a - b)) {
      offered++;
      const b = document.createElement("button");
      b.className = "shop-item";
      b.innerHTML = `<b style="color:${tierColor(t)}">Socket T${t} Sector Key</b>` +
        `<span>runs this sector at T${t}</span><em>×${normals[t].length}</em>`;
      b.addEventListener("click", () => enterNode(q, r, normals[t][0].id));
      box.appendChild(b);
    }
    for (const kk of modded) {
      offered++;
      const mods = kk.affixes.map(a => KEY_MOD_BY[a.mod].desc).join(" · ");
      const b = document.createElement("button");
      b.className = "shop-item";
      b.innerHTML = `<b style="color:${RARITY[kk.rarity].color}">${keyDisplayName(kk)}</b>` +
        `<span>${mods || "no modifiers"}</span><em>+${Math.round(keyQuant(kk) * 100)}% loot</em>`;
      b.addEventListener("click", () => enterNode(q, r, kk.id));
      box.appendChild(b);
    }
    if (!offered) {
      const none = document.createElement("p");
      none.className = "stats";
      none.textContent = "No keys. Purge other sectors for drops, or fabricate one at the Bay.";
      box.appendChild(none);
    }
  }
  document.getElementById("node").classList.remove("hidden");
}
document.getElementById("node-close").addEventListener("click", () =>
  document.getElementById("node").classList.add("hidden"));

document.getElementById("btn-extract").addEventListener("click", () => {
  if (run.mode !== "sector") return;
  const btn = document.getElementById("btn-extract");
  const purged = profile && profile.atlas.nodes[run.sectorNode] &&
    profile.atlas.nodes[run.sectorNode].state === "cleared";
  if (!purged && btn.dataset.arm !== "1") {
    btn.dataset.arm = "1";
    btn.textContent = "Abandon sector?";
    return;
  }
  btn.dataset.arm = "";
  extractToOverworld();
});

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
  if (ui.screen !== "game") return undefined;
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
  if (ui.throwDart) {
    ui.throwDart = false;
    if (enemy) { if (!useConsumable("dart", enemy)) log("No clear lane for the dart.", "warn"); }
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
  if (ui.screen !== "game" || !ui.walking || run.over) { ui.walking = null; return; }
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
    if (ui.screen === "overworld") {
      openNodePanel(h.q, h.r);
      refreshHud();
      return;
    }
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
  const kk = ev.key.toLowerCase();
  if (ui.screen === "overworld") {
    if (kk === "b" || kk === "i") { if (gearOpen()) closeGear(); else openGear(); }
    else if (kk === "escape") { closeGear(); document.getElementById("node").classList.add("hidden"); }
    refreshHud();
    return;
  }
  if (run.over) return;
  const k = kk;
  if (k === "r") { ui.rollMode = !ui.rollMode; }
  else if (k === "f") actParry();
  else if (k === "h" || k === "q") actFlask();
  else if (k === "b" || k === "i") { if (gearOpen()) closeGear(); else openGear(); }
  else if (k === " ") { ev.preventDefault(); actWait(); }
  else if (k === "escape") { ui.rollMode = false; ui.throwDart = false; closeGear(); }
  refreshHud();
});

/* menu / overlays */
function showMenu() {
  const per = persist();
  document.getElementById("menu-stats").textContent =
    (per.deaths || 0) + " units lost · " + (per.wins || 0) + " cores taken · deepest: Sector " + (per.best || 0);
  const unlocked = profile && profile.atlas && profile.atlas.unlocked;
  document.getElementById("begin-btn").textContent = unlocked ? "Enter the Foundry" : "Initialize";
  document.getElementById("stain-note").textContent = unlocked
    ? (() => {
        const cleared = Object.values(profile.atlas.nodes).filter(n => n.state === "cleared").length;
        return `The Foundry is open — ${cleared} sector${cleared === 1 ? "" : "s"} purged, ${profile.atlas.keys.length} key${profile.atlas.keys.length === 1 ? "" : "s"} held.`;
      })()
    : per.stain ? "A wreck holding " + per.stain.souls + " cores waits in Sector " + per.stain.floor + "." : "";
  const reset = document.getElementById("reset-profile");
  reset.classList.toggle("hidden", !profile);
  reset.textContent = "Reset Foundry profile";
  reset.dataset.arm = "";
  document.getElementById("menu").classList.remove("hidden");
}
function startRun(seed) {
  bought = {};
  ui.throwDart = false;
  ui.rollMode = false;
  ui.screen = "game";
  document.body.classList.remove("overworld");
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("death").classList.add("hidden");
  document.getElementById("win").classList.add("hidden");
  document.getElementById("terminal").classList.add("hidden");
  document.getElementById("inv").classList.add("hidden");
  document.getElementById("node").classList.add("hidden");
  newRun(seed);
  cam.x = hexX(run.player.q, run.player.r);
  cam.y = hexY(run.player.q, run.player.r);
  centerCam();
  refreshHud();
  renderLog();
}
document.getElementById("begin-btn").addEventListener("click", () => {
  if (profile && profile.atlas && profile.atlas.unlocked) {
    document.getElementById("menu").classList.add("hidden");
    enterOverworld();
  } else startRun();
});
document.getElementById("death-retry").addEventListener("click", () => {
  if (run.mode === "sector") {
    document.getElementById("death").classList.add("hidden");
    enterOverworld();
  } else startRun();
});
document.getElementById("death-menu").addEventListener("click", () => {
  document.getElementById("death").classList.add("hidden");
  showMenu();
});
document.getElementById("win-again").addEventListener("click", () => {
  document.getElementById("win").classList.add("hidden");
  if (profile && profile.atlas && profile.atlas.unlocked) enterOverworld();
  else startRun();
});
document.getElementById("win-menu").addEventListener("click", () => {
  document.getElementById("win").classList.add("hidden");
  showMenu();
});
document.getElementById("reset-profile").addEventListener("click", ev => {
  ev.preventDefault();
  const el = ev.currentTarget;
  if (el.dataset.arm !== "1") {
    el.dataset.arm = "1";
    el.textContent = "Click again to wipe character + map";
    return;
  }
  el.dataset.arm = "";
  try { localStorage.removeItem(PROFILE_KEY); } catch (e) { /* private mode */ }
  profile = null;
  showMenu();
});
window.addEventListener("beforeunload", () => {
  syncProfileFromPlayer();
  saveProfile();
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
  ENEMY, BASE_TYPES, SLOTS, SLOT_LABEL, RARITY, STAT_KEYS,
  PREFIXES, SUFFIXES, UNIQUES, CURRENCY,
  genItem, genUnique, genArmoryItem, genCorruptedItem, rollItemLoot, rollRarity,
  equipItem, unequipItem, dropItem, itemById, equippedItem, isEquipped, itemEffect,
  activeWeaponItem, getActiveWeaponType,
  canApplyOrb, applyOrb, grantOrbs, rollOrbKind,
  useConsumable, inCombat, recalc, canReach,
  get profile() { return profile; },
  enterOverworld, enterNode, extractToOverworld, fabricateKey,
  sectorComplete, revealNode, keyFabCost, BIOMES, TIER_CAP,
  makeKey, addKeyMod, keyQuant, keyDisplayName, canApplyOrbKey, applyOrbToKey, KEY_MODS,
  donutHexes, laneHexes, gateCleared, spawnGateNode, atlasCap, tierColor,
  hurtEnemy, hurtPlayer, winRun, dieRun,
  saveProfile, loadProfile, syncProfileFromPlayer,
  ui,
  setRun(r) { run = r; },
};
