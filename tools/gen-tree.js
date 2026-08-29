/* Frame-lattice expansion generator.
 *
 * Grows the hand-authored 64-node skeleton to a 300+ node constellation
 * and splices the result into the repo files between marker comments:
 *   - config.js  frameTree.nodes  (GENERATED-EXPANSION-BEGIN/END)
 *   - rl.js      TREE_LAYOUT LOCAL (GENERATED-LAYOUT-BEGIN/END)
 *
 * Deterministic (fixed seed): rerunning always regenerates the identical
 * expansion, so the generated blocks are committed and the tool only needs
 * rerunning when its rules change. The skeleton (everything above the
 * markers) is the anchor set and is never touched.
 *
 * Structure grown per branch, hanging off the existing spine:
 *   - from each of the 3 spine notables: two ARMS (7 smalls + an arm
 *     notable), each arm carrying two 2-node TWIGS, the arm notable ring-
 *     closing through the outer twig (ANY-of requires);
 *   - one SPAN node per junction bridging the two arms (opens from either);
 *   - a 4-node DEEP VAULT past the tip-cluster notable (3 smalls + a vault
 *     notable that re-uses an existing mech key at +1 power);
 *   - 3 AMPLIFIER smalls behind each root special attack (fan + mini-ring),
 *     so the special you committed to grows a tail of its own.
 *
 * Usage: node tools/gen-tree.js
 */
const fs = require("fs");
const path = require("path");

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xF0714D);
const pick = arr => arr[(rng() * arr.length) | 0];

/* ---- anchors: local coords of the skeleton nodes we grow from (copied
   from rl.js TREE_LAYOUT LOCAL — lateral x, outward y, pre-rotation) ---- */
const BRANCHES = {
  chassis: {
    prefix: "ch",
    junctions: [["chN1", -150, 235], ["chN2", 60, 445], ["chN3", -45, 650]],
    cluster: ["chc3", 0, 1000],
    vaultMech: { key: "parryRefund", power: 1 },
    vaultEffect: { maxHpBonus: 3 },
    vaultDesc: "The deflector's vented charge doubles back once more: +1 power refunded on a successful deflect.",
    adjectives: ["Welded", "Riveted", "Ceramic", "Layered", "Tempered", "Annealed", "Grafted", "Sintered",
      "Banded", "Crowned", "Buttressed", "Forged", "Pinned", "Slagcast", "Milled", "Vaulted"],
    nouns: ["Plating", "Bulkhead", "Course", "Truss", "Casing", "Mantle", "Shell", "Rib",
      "Keelson", "Stanchion", "Cladding", "Berm", "Revetment", "Carapace", "Chine", "Gusset"],
    smallPool: [
      { effect: { maxHpBonus: 2 }, w: 3 },
      { effect: { flaskHealBonus: 2 }, w: 3 },
      { effect: { maxStBonus: 1 }, w: 2 },
    ],
    capped: [{ effect: { parryCostDelta: -1 }, max: 2 }],
    notablePacks: [{ maxHpBonus: 4 }, { maxHpBonus: 2, flaskHealBonus: 2 }],
    notableDesc: "A heavy junction in the plating web.",
    spanEffect: { maxHpBonus: 2 },
    vaultSmall: { maxHpBonus: 2 },
  },
  servos: {
    prefix: "sv",
    junctions: [["svN1", -60, 265], ["svN2", 35, 505], ["svN3", -40, 740]],
    cluster: ["svc3", 0, 1175],
    vaultMech: { key: "bsKillRefund", power: 1 },
    vaultEffect: { bsBonus: 2 },
    vaultDesc: "The reclaimer taps deeper: +1 more power vented back on a rear-strike kill.",
    adjectives: ["Torqued", "Sprung", "Whetted", "Cammed", "Geared", "Flexed", "Coiled", "Tuned",
      "Snapped", "Keened", "Ratcheted", "Overwound", "Balanced", "Counterweighted", "Oiled", "Trued"],
    nouns: ["Actuator", "Striker", "Piston", "Linkage", "Tendon", "Flywheel", "Crank", "Knuckle",
      "Talon", "Lash", "Mainspring", "Escapement", "Rocker", "Follower", "Tappet", "Sprocket"],
    smallPool: [
      { effect: { bsBonus: 1 }, w: 2 },
      { effect: { maxStBonus: 1 }, w: 2 },
      { effect: { flaskHealBonus: 2 }, w: 1 },
    ],
    capped: [{ effect: { dmg: 1 }, max: 4 }, { effect: { rollCostDelta: -1 }, max: 2 }],
    notablePacks: [{ bsBonus: 2, dmg: 1 }, { bsBonus: 2, maxStBonus: 1 }],
    notableDesc: "A killing junction in the drive train.",
    spanEffect: { bsBonus: 1 },
    vaultSmall: { bsBonus: 1 },
  },
  systems: {
    prefix: "sy",
    junctions: [["syN1", 160, 245], ["syN2", -70, 455], ["syN3", -10, 675]],
    cluster: ["syc3", -15, 1095],
    vaultMech: { key: "eliteOrbBonus", power: 1 },
    vaultEffect: { salvageMult: 0.2 },
    vaultDesc: "The rites go deeper: Prime kills pay one more currency orb.",
    adjectives: ["Calibrated", "Phased", "Doped", "Etched", "Polarized", "Trawling", "Indexed", "Resonant",
      "Filtered", "Harmonic", "Spectral", "Attuned", "Manifold", "Threaded", "Cached", "Sifting"],
    nouns: ["Antenna", "Assay", "Ledger", "Sensorium", "Sieve", "Optic", "Register", "Sounder",
      "Prospect", "Tally", "Waveguide", "Detector", "Manifest", "Dowser", "Beacon", "Cortex"],
    smallPool: [
      { effect: { salvageMult: 0.1 }, w: 3 },
      { effect: { maxStBonus: 1 }, w: 2 },
      { effect: { flaskHealBonus: 2 }, w: 1 },
    ],
    capped: [{ effect: { fovBonus: 1 }, max: 5 }],
    notablePacks: [{ salvageMult: 0.2, fovBonus: 1 }, { salvageMult: 0.15, maxStBonus: 1 }],
    notableDesc: "A rich junction in the scanner web.",
    spanEffect: { salvageMult: 0.1 },
    vaultSmall: { salvageMult: 0.1 },
  },
};
const ROOT_AMPS = {
  spSlam:    { base: [-70, 70], effects: [{ maxHpBonus: 2 }, { maxStBonus: 1 }, { maxHpBonus: 2 }] },
  spCharge:  { base: [0, 85],   effects: [{ bsBonus: 1 }, { maxStBonus: 1 }, { rollCostDelta: -1 }] },
  spBarrage: { base: [70, 70],  effects: [{ fovBonus: 1 }, { maxStBonus: 1 }, { dmg: 1 }] },
};

const usedNames = new Set();
function makeName(br) {
  for (let i = 0; i < 200; i++) {
    const n = pick(br.adjectives) + " " + pick(br.nouns);
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  throw new Error("name pool exhausted");
}
function rollSmall(br, caps) {
  // capped rares first, at a small fixed chance while under their cap
  for (let i = 0; i < br.capped.length; i++) {
    const c = br.capped[i];
    caps[i] = caps[i] || 0;
    if (caps[i] < c.max && rng() < 0.08) { caps[i]++; return c.effect; }
  }
  const total = br.smallPool.reduce((s, p) => s + p.w, 0);
  let x = rng() * total;
  for (const p of br.smallPool) { if (x < p.w) return p.effect; x -= p.w; }
  return br.smallPool[0].effect;
}

const nodes = [];   // { id, branch, kind, name, requires, effect?, mech?, desc? }
const layout = {};  // id -> [x, y]
function add(n, x, y) { nodes.push(n); layout[n.id] = [Math.round(x), Math.round(y)]; }

for (const [branch, br] of Object.entries(BRANCHES)) {
  const caps = [];
  br.junctions.forEach(([jid, jx, jy], ji) => {
    const armEnds = [];   // node-3 ids for the span
    for (const side of [-1, 1]) {
      const tag = side < 0 ? "a" : "b";
      // arm direction: lateral with a growing outward bias, so arms sweep
      // out and away instead of colliding with the neighbouring branch
      let ang = Math.atan2(0.42, side);   // cos(ang) carries the side's sign
      let x = jx, y = jy, prev = jid;
      const armIds = [];
      for (let k = 1; k <= 8; k++) {
        const isNotable = k === 8;
        const step = 78;
        // jitter plus a steady outward curl (toward +y on whichever side)
        ang += (rng() - 0.5) * 0.24 + 0.055 * side;
        x += Math.cos(ang) * step;
        y += Math.sin(ang) * step;
        const id = `${br.prefix}g${ji + 1}${tag}${k}`;
        if (isNotable) {
          const pack = br.notablePacks[(ji + (side > 0 ? 1 : 0)) % br.notablePacks.length];
          add({ id, branch, kind: "notable", name: makeName(br),
            requires: [prev, `${br.prefix}g${ji + 1}${tag}u2`],
            desc: br.notableDesc, effect: pack }, x, y);
        } else {
          add({ id, branch, kind: "small", name: makeName(br),
            requires: [prev], effect: rollSmall(br, caps) }, x, y);
        }
        armIds.push(id);
        prev = id;
      }
      armEnds.push(armIds[2]);
      // two twigs: off arm node 2 (inner) and arm node 5 (outer); the
      // outer twig's tip is the arm notable's second way in (ring closure)
      for (const [tt, offIdx] of [["t", 1], ["u", 4]]) {
        const [ox, oy] = layout[armIds[offIdx]];
        const perp = side < 0 ? -1 : 1;
        add({ id: `${br.prefix}g${ji + 1}${tag}${tt}1`, branch, kind: "small", name: makeName(br),
          requires: [armIds[offIdx]], effect: rollSmall(br, caps) },
          ox + 18 * perp, oy + 66);
        add({ id: `${br.prefix}g${ji + 1}${tag}${tt}2`, branch, kind: "small", name: makeName(br),
          requires: [`${br.prefix}g${ji + 1}${tag}${tt}1`], effect: rollSmall(br, caps) },
          ox + 52 * perp, oy + 126);
      }
    }
    // span: bridges the two arms at their third node, opens from either
    const [ax, ay] = layout[armEnds[0]], [bx, by] = layout[armEnds[1]];
    add({ id: `${br.prefix}g${ji + 1}x`, branch, kind: "small", name: makeName(br),
      requires: [armEnds[0], armEnds[1]], effect: br.spanEffect },
      (ax + bx) / 2, (ay + by) / 2 + 42);
  });
  // deep vault: a short chain past the tip-cluster notable, ending on a
  // notable that re-uses an existing mech key at +1 power
  const [cid, cx, cy] = br.cluster;
  let prev = cid;
  for (let k = 1; k <= 3; k++) {
    const id = `${br.prefix}v${k}`;
    add({ id, branch, kind: "small", name: makeName(br),
      requires: [prev], effect: br.vaultSmall },
      cx + (rng() - 0.5) * 48, cy + 80 * k);
    prev = id;
  }
  add({ id: `${br.prefix}vN`, branch, kind: "notable", name: makeName(br),
    requires: [prev], desc: br.vaultDesc, mech: br.vaultMech, effect: br.vaultEffect },
    cx, cy + 330);
}

// root amplifiers: a small tail behind each special attack — two fan off
// the special, the third ring-closes on the pair
for (const [sp, conf] of Object.entries(ROOT_AMPS)) {
  const [bx, by] = conf.base;
  const ids = [];
  conf.effects.forEach((eff, i) => {
    const id = `${sp}A${i + 1}`;
    const req = i < 2 ? [sp] : [`${sp}A1`, `${sp}A2`];
    add({ id, branch: "root", kind: "small", name: null, requires: req, effect: eff },
      bx + (i - 1) * 58, by + (i === 1 ? 92 : 70));
    ids.push(id);
  });
}
// names for root amps: themed per special
const AMP_NAMES = {
  spSlamA1: "Overload Damper", spSlamA2: "Overload Reservoir", spSlamA3: "Overload Harmonics",
  spChargeA1: "Rail Shunt", spChargeA2: "Rail Capacitor", spChargeA3: "Rail Harmonics",
  spBarrageA1: "Volley Rifling", spBarrageA2: "Volley Magazine", spBarrageA3: "Volley Harmonics",
};
for (const n of nodes) if (n.branch === "root") n.name = AMP_NAMES[n.id];

/* ---- emit ---- */
function jsonEffect(e) {
  return "{ " + Object.entries(e).map(([k, v]) => `"${k}": ${v}`).join(", ") + " }";
}
const cfgLines = nodes.map(n => {
  let s = `      { "id": "${n.id}", "branch": "${n.branch}", "kind": "${n.kind}", "name": ${JSON.stringify(n.name)}, ` +
    `"requires": ${JSON.stringify(n.requires)}`;
  if (n.desc) s += `,\n        "desc": ${JSON.stringify(n.desc)}`;
  if (n.mech) s += `, "mech": { "key": "${n.mech.key}", "power": ${n.mech.power} }`;
  if (n.effect) s += `, "effect": ${jsonEffect(n.effect)}`;
  return s + " },";
});

const layLines = [];
{
  const ids = Object.keys(layout);
  for (let i = 0; i < ids.length; i += 6) {
    layLines.push("    " + ids.slice(i, i + 6)
      .map(id => `${id}: [${layout[id][0]}, ${layout[id][1]}]`).join(", ") + ",");
  }
}

function splice(file, beginMark, endMark, lines) {
  const p = path.resolve(__dirname, "..", file);
  const src = fs.readFileSync(p, "utf8");
  const begin = src.indexOf(beginMark);
  const end = src.indexOf(endMark);
  if (begin < 0 || end < 0) throw new Error(`markers not found in ${file}`);
  const insertAt = src.indexOf("\n", begin) + 1;
  const out = src.slice(0, insertAt) + lines.join("\n") + "\n" +
    src.slice(src.lastIndexOf("\n", end) + 1);
  fs.writeFileSync(p, out);
}
splice("config.js", "GENERATED-EXPANSION-BEGIN", "GENERATED-EXPANSION-END", cfgLines);
splice("rl.js", "GENERATED-LAYOUT-BEGIN", "GENERATED-LAYOUT-END", layLines);

/* ---- summary for the balance harness bounds ---- */
const totals = {};
for (const n of nodes) if (n.effect)
  for (const [k, v] of Object.entries(n.effect)) totals[k] = Math.round(((totals[k] || 0) + v) * 100) / 100;
console.log(`generated ${nodes.length} nodes (${nodes.filter(n => n.kind === "notable").length} notables)`);
console.log("new-node stat totals:", JSON.stringify(totals));
