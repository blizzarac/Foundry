/* Ironhex balance & generation config — loaded before rl.js.

   This is plain JSON-shaped data (no functions, no logic) wrapped in one
   assignment so it still works with zero build step over file://. A real
   .json file can't be fetch()'d from local disk by a browser, and this
   game (and its whole test suite) runs by opening index.html directly —
   so a <script> tag is the version of "config file" that doesn't break
   local play.

   rl.js reads this object once at boot and validates it: a missing
   section fails loudly (console error + an on-screen banner) instead of
   quietly producing NaN damage twenty minutes into a run. Numbers only —
   behavior (formulas, terrain generators, boss attack patterns, AI)
   stays in rl.js. Edit the numbers below to retune the game; run
   `node tests/balance-smoke.js` after any change that touches combat
   power to see the effect on the measured TTK/HTD curve. */
window.IRONHEX_CONFIG = {
  "configVersion": 1,

  "enemies": {
    // per-type base stats at tier 1, before any scaling below is applied
    "base": {
      "scrapper": { "hp": 4,  "dmg": 3, "souls": 10 },
      "railer":   { "hp": 3,  "dmg": 2, "souls": 12 },
      "bulwark":  { "hp": 6,  "dmg": 4, "souls": 18 },
      "mortar":   { "hp": 4,  "dmg": 4, "souls": 20 },
      "crusher":  { "hp": 9,  "dmg": 5, "souls": 25 },
      "ripper":   { "hp": 5,  "dmg": 4, "souls": 16 },
      "boss":     { "hp": 34, "dmg": 5, "souls": 0 },
      "sentinel": { "hp": 30, "dmg": 5, "souls": 150 },
      // the deeper gate guardians and the apex boss — same tier scaling as
      // everything else, so their bands do most of the heavy lifting
      "warden":   { "hp": 34, "dmg": 5, "souls": 300 },
      "crucible": { "hp": 38, "dmg": 6, "souls": 500 },
      "prime":    { "hp": 46, "dmg": 6, "souls": 900 },
      "hauler":   { "hp": 3,  "dmg": 0, "souls": 6 }
    },
    "scaling": {
      // keyed-sector hp: base.hp * (1 + hpGrowthPerTier * (tier - 1))
      "hpGrowthPerTier": 0.42,
      // keyed-sector dmg: base.dmg + 1 + floor((tier - dmgFreeTiers) / dmgStepEveryNTiers), from tier dmgFreeTiers on.
      // dmgFreeTiers dropped to 1 so this applies from T1 (it used to leave
      // T1-T2 with zero enemy dmg growth at all) — every tier gets a flat
      // +1 dmg over the old curve, not just the deep end
      "dmgFreeTiers": 1,
      "dmgStepEveryNTiers": 2,
      // a promoted Prime unit (any sector): hp *= hpMult, dmg += dmgAdd
      "elitePromotion": { "hpMult": 1.5, "dmgAdd": 1 },
      // past the gate ladder (tier > levelGen.tierCap) enemy stats gain a
      // COMPOUNDING multiplier per deep tier on top of the linear formulas
      // above. Gear's deep scaling is linear (items.affixDeepScaling), so
      // exponential-vs-linear guarantees the tiers outpace any build
      // eventually — the wall is a mathematical certainty, and these two
      // numbers set how deep it lands
      "postLadder": { "hpMultPerTier": 1.05, "dmgMultPerTier": 1.02 }
    }
  },

  "campaign": {
    // the five-sector prologue, fixed spawn tables (no tier scaling)
    "floors": [
      { "R": 8, "spawn": { "scrapper": 4, "railer": 1 } },
      { "R": 8, "spawn": { "scrapper": 3, "railer": 2, "bulwark": 1, "crusher": 1 }, "elite": true, "terminal": true },
      { "R": 9, "spawn": { "scrapper": 4, "railer": 2, "bulwark": 1, "crusher": 1, "ripper": 1, "mortar": 1 }, "elite": true, "terminal": true },
      { "R": 9, "spawn": { "scrapper": 4, "railer": 2, "bulwark": 2, "crusher": 2, "ripper": 2, "mortar": 1 }, "elite": true, "terminal": true },
      { "R": 7, "boss": true }
    ]
  },

  "levelGen": {
    "startingTierCap": 4,
    "tierCap": 15,
    "gateJumpAmount": 4,
    "gateClear": { "keysGranted": 2, "orbsGranted": 3 },
    // which guardian each gate band wakes (band = the tier cap when the
    // gate surfaced): the SENTINEL walls off the first climb, the WARDEN
    // the second, the CRUCIBLE the last. Unlisted bands fall back to the
    // SENTINEL. Boss *kits* (attack verbs, phases) are combat code in
    // rl.js — this only assigns who guards where.
    "gateBossByBand": { "4": "sentinel", "8": "warden", "12": "crucible" },
    // the apex node: surfaces when the tier cap reaches tierCap, eats a
    // top-tier key, holds the FORGE-PRIME. Repeatable — each kill pays
    // lattice points, a guaranteed unique, and orbs, then a fresh apex
    // surfaces elsewhere on the frontier.
    "apex": { "arenaR": 10, "treePoints": 3, "orbsGranted": 4 },
    "sector": {
      "baseR": 8,
      "bigRAtTier": 3,
      "gateArenaR": 9,
      // pack density: spawnCount *= 1 + packGrowthPct * floor(tier / packGrowthEveryNTiers)
      "packGrowthEveryNTiers": 3,
      "packGrowthPct": 0.1,
      // sectors at these tiers (and beyond) each add one more Prime unit —
      // the purge objective only requires killing Primes, so this is the
      // lever that actually forces more simultaneous attackers on a player
      // routing around trash packs. Spaced evenly from T1 instead of
      // starting at 3, so the climb gets denser everywhere, not just past
      // the old T11 stopping point — reaches the same T15 count as before,
      // just earlier
      "eliteBumpTiers": [1, 4, 7, 10, 13],
      "chestBonusAtTier": 3,
      "chestPerLootBonus": 0.25,
      "terminalChance": 0.4,
      // sectorComplete(): odds a second key drops, weighted by Primes killed
      // and the key's own loot bonus; odds a dropped key is one tier deeper
      "keyDropSecondChanceEliteWeight": 0.3,
      "keyDropBumpTierChance": 0.35,
      "keyDropMagicChanceAtTier2Plus": 0.2,
      // once the gate ladder is complete (live cap at levelGen.tierCap),
      // found keys stop clamping to the cap: a tier-n sector can drop a
      // key up to n + this far ahead, forever — tiers are open-ended and
      // progression past the ladder is sustained by drops, not the Bay
      // (fabrication stays capped at the ladder ceiling)
      "keyDropAheadPostLadder": 1
    },
    // territory minimums: the landscape itself sets a floor on which keys
    // a frontier node accepts (the key still sets the sector's ACTUAL
    // tier — this only refuses keys below the local minimum). Within
    // graceRadius of the Bay everything stays open; past it the minimum
    // climbs one tier per ringWidth hexes, forever. Hot zones are
    // deterministic pockets (hotZoneSize-hex blocks, hotZoneDensity of
    // them, never inside the grace radius) demanding hotZoneBonusTiers
    // more than their surroundings. Demanding land also PAYS: nodes grant
    // bonus loot quantity per minimum tier (quantPerMinTier, the same
    // axis key mods use) plus a flat hotZoneQuantBonus inside a hot zone.
    // Gates and the apex ignore territory — they demand their exact band
    // key already.
    "territory": {
      "graceRadius": 6,
      "ringWidth": 4,
      "hotZoneSize": 5,
      "hotZoneDensity": 0.12,
      "hotZoneBonusTiers": 4,
      "quantPerMinTier": 0.03,
      "hotZoneQuantBonus": 0.15
    },
    // every Sector Key modifier: quant is the loot-bonus % it contributes;
    // the rest are magnitudes applied to the sector when a key carrying
    // this mod is socketed (spawnMult/hpMult multiply, dmgAdd/fovPenalty/
    // flaskPenalty/extraElites add, volatile just flips a flag)
    "keyMods": [
      { "key": "swarming",    "name": "Swarming",    "desc": "+50% enemy packs",                          "quant": 0.20, "spawnMult": 1.5 },
      { "key": "overcharged", "name": "Overcharged", "desc": "machines hit for +1",                       "quant": 0.15, "dmgAdd": 1 },
      { "key": "armored",     "name": "Armored",     "desc": "machines +30% integrity",                   "quant": 0.15, "hpMult": 1.3 },
      { "key": "primed",      "name": "Primed",      "desc": "+1 Prime unit",                             "quant": 0.20, "extraElites": 1 },
      { "key": "dark",        "name": "Darkened",    "desc": "sensor range -2",                           "quant": 0.15, "fovPenalty": 2 },
      { "key": "volatile",    "name": "Volatile",    "desc": "machines detonate on death: 1 dmg adjacent", "quant": 0.20, "volatile": true },
      { "key": "rusted",      "name": "Rusted",      "desc": "repair cells heal -3",                      "quant": 0.10, "flaskPenalty": 3 }
    ]
  },

  "economy": {
    // RETIRED shop upgrades, kept only so the profile migration can refund
    // exactly what old saves spent (cost = round(base * 2^ranksBought)) and
    // strip exactly the stats those ranks granted. The live replacement is
    // the frame lattice ("frameTree" section below); nothing sells these.
    "upgrades": [
      { "id": "hp",    "name": "Chassis reinforcement", "desc": "+4 max integrity", "base": 30, "cap": 5, "delta": { "baseMaxHp": 4, "hp": 4 } },
      { "id": "st",    "name": "Capacitor bank",        "desc": "+1 max power",     "base": 50, "cap": 2, "delta": { "baseMaxSt": 1, "st": 1 } },
      { "id": "dmg",   "name": "Weapon calibration",    "desc": "+1 weapon damage", "base": 60, "cap": 3, "delta": { "bonusDmg": 1 } },
      { "id": "flask", "name": "Nanite reservoir",      "desc": "+1 repair cell",   "base": 40, "cap": 2, "delta": { "maxFlask": 1, "flask": 1 } }
    ],
    "orbs": [
      { "kind": "transmute", "cost": 30 },
      { "kind": "aug",       "cost": 50 },
      { "kind": "alch",      "cost": 90 },
      { "kind": "regal",     "cost": 140 },
      { "kind": "bless",     "cost": 120 },
      { "kind": "chaos",     "cost": 250 },
      { "kind": "exalt",     "cost": 400 }
    ],
    // weight for rollOrbKind's loot-drop pool (chests, elite kills, gate
    // clears). weightAtDepth3Plus overrides weight from depth 3 on —
    // exalt/chaos are rarer early since there's nothing to spend them on
    // before Magic/Rare gear exists yet.
    "orbDropWeights": [
      { "kind": "transmute", "weight": 4 },
      { "kind": "aug",       "weight": 4 },
      { "kind": "alch",      "weight": 3 },
      { "kind": "regal",     "weight": 2 },
      { "kind": "bless",     "weight": 2 },
      { "kind": "exalt",     "weight": 1, "weightAtDepth3Plus": 2 },
      { "kind": "chaos",     "weight": 1, "weightAtDepth3Plus": 2 }
    ],
    "gambleCost": 350,
    // key fabrication: cost = round(base * tier^exponent)
    "keyFab": { "base": 30, "exponent": 1.7 },
    "salvage": {
      "rarityFloor": { "normal": 5, "magic": 15, "rare": 40, "unique": 120 },
      "perAffixTier": 5,
      // key salvage: round(fabCost * keyBaseFrac) + round(fabCost * keyPerModFrac) * modCount
      "keyBaseFrac": 0.5,
      "keyPerModFrac": 0.15
    }
  },

  // The frame lattice: the permanent upgrade tree that replaced the shop's
  // flat frame upgrades. Points come from Foundry milestones, never cores —
  // one per first-time sector purge, more per SENTINEL gate — so the tree
  // paces itself with the tier climb instead of capping out after the
  // prologue. Three stat branches plus a small root cluster; each node
  // lists the node(s) that unlock it ("requires": [] marks a branch entry
  // point, open from the start).
  // "kind" is small/notable/keystone/jewel/special: smalls carry flat
  // stats through the same STAT_KEYS vocabulary items use, notables may
  // instead carry a "mech" — a key into a real combat-code branch in rl.js
  // (the closed set TREE_MECH_KEYS) plus its magnitude — keystones trade
  // power for a downside, jewels are the prism sockets past each keystone
  // that fan into a tip cluster, and specials are the root-tier active
  // attacks (also mech-keyed): exactly one active at a time, same
  // exclusivity rule as keystones, but with no prerequisite and nothing
  // ever hanging off one so they're always free to swap. Each spine also
  // hangs side twigs (nodes whose requires point at a mid-spine node), and
  // a node with several requires opens when ANY of them is installed — the
  // cluster rings close on themselves. Refunding is free but only from the
  // tip of a branch inward.
  "frameTree": {
    "pointsPerPurge": 1,
    "pointsPerGate": 2,
    "nodes": [
      // root cluster: one special attack, picked independent of which of
      // the three branches you sink points into (unlike a keystone, these
      // sit at the very entry — no prerequisite chain at all) and mutually
      // exclusive with each other the same way keystones are. Always free
      // to remove (nothing ever hangs off a leaf with no children).
      { "id": "spSlam",    "branch": "root", "kind": "special", "name": "Overload Slam",
        "requires": [], "desc": "Vent the deflector field outward: every adjacent machine takes a hit and staggers.",
        "mech": { "key": "specialSlam", "power": 1 } },
      { "id": "spCharge",  "branch": "root", "kind": "special", "name": "Rail Charge",
        "requires": [], "desc": "Punch the thrusters down a straight lane, striking everything in the path before you land.",
        "mech": { "key": "specialCharge", "power": 1 } },
      { "id": "spBarrage", "branch": "root", "kind": "special", "name": "Barrage Volley",
        "requires": [], "desc": "Discharge the weapon down a lane at range — no reach required, but you hold your ground.",
        "mech": { "key": "specialBarrage", "power": 1 } },

      { "id": "ch1", "branch": "chassis", "kind": "small",    "name": "Plating Weave",       "requires": [],      "effect": { "maxHpBonus": 2 } },
      { "id": "ch2", "branch": "chassis", "kind": "small",    "name": "Sealed Joints",       "requires": ["ch1"], "effect": { "maxHpBonus": 2 } },
      { "id": "chN1", "branch": "chassis", "kind": "notable", "name": "Reactive Plating",    "requires": ["ch2"],
        "desc": "A successful deflect vents its charge back: refunds 2 power.", "mech": { "key": "parryRefund", "power": 2 } },
      { "id": "ch3", "branch": "chassis", "kind": "small",    "name": "Nanite Lattice",      "requires": ["chN1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "ch4", "branch": "chassis", "kind": "small",    "name": "Composite Hull",      "requires": ["ch3"], "effect": { "maxHpBonus": 2 } },
      { "id": "chN2", "branch": "chassis", "kind": "notable", "name": "Aegis Long-Field",    "requires": ["ch4"],
        "desc": "The deflector field extends to the sensor horizon: deflect catches strikes from any distance, not just adjacent.", "mech": { "key": "parryRange", "power": 1 } },
      { "id": "ch5", "branch": "chassis", "kind": "small",    "name": "Hardened Mounts",     "requires": ["chN2"], "effect": { "parryCostDelta": -1 } },
      { "id": "ch6", "branch": "chassis", "kind": "small",    "name": "Ablative Mesh",       "requires": ["ch5"], "effect": { "maxHpBonus": 2 } },
      { "id": "chN3", "branch": "chassis", "kind": "notable", "name": "Triage Loop",         "requires": ["ch6"], "effect": { "flaskHealBonus": 4 } },
      { "id": "ch7", "branch": "chassis", "kind": "small",    "name": "Bulk Frame",          "requires": ["chN3"], "effect": { "maxHpBonus": 3 } },
      { "id": "ch8", "branch": "chassis", "kind": "small",    "name": "Redundant Cores",     "requires": ["ch7"], "effect": { "maxHpBonus": 3 } },
      { "id": "chK", "branch": "chassis", "kind": "keystone", "name": "Monolith Chassis",    "requires": ["ch8"],
        "desc": "Immense mass. The frame shrugs off what would cripple anything lighter, and the thrusters pay for every gram.", "effect": { "maxHpBonus": 6, "rollCostDelta": 1 } },
      { "id": "cht1", "branch": "chassis", "kind": "small",   "name": "Girder Struts",       "requires": ["ch1"], "effect": { "maxHpBonus": 2 } },
      { "id": "cht2", "branch": "chassis", "kind": "small",   "name": "Coolant Shunts",      "requires": ["ch3"], "effect": { "flaskHealBonus": 2 } },
      { "id": "cht3", "branch": "chassis", "kind": "small",   "name": "Blast Baffles",       "requires": ["ch4"], "effect": { "maxHpBonus": 2 } },
      { "id": "cht4", "branch": "chassis", "kind": "small",   "name": "Keel Plate",          "requires": ["ch6"], "effect": { "maxHpBonus": 2 } },
      { "id": "cht5", "branch": "chassis", "kind": "small",   "name": "Auxiliary Manifold",  "requires": ["ch7"], "effect": { "maxStBonus": 1 } },
      { "id": "chJ",  "branch": "chassis", "kind": "jewel",   "name": "Bastion Prism",       "requires": ["chK"],
        "desc": "A cut core socketed past the keystone: the fortress cluster grows from it.", "effect": { "maxHpBonus": 3 } },
      { "id": "chc1", "branch": "chassis", "kind": "small",   "name": "Rampart Facet",       "requires": ["chJ"], "effect": { "maxHpBonus": 2 } },
      { "id": "chc2", "branch": "chassis", "kind": "small",   "name": "Mender Facet",        "requires": ["chJ"], "effect": { "flaskHealBonus": 3 } },
      { "id": "chc3", "branch": "chassis", "kind": "notable", "name": "Unbreakable",         "requires": ["chc1", "chc2"], "effect": { "maxHpBonus": 4 } },

      { "id": "sv1", "branch": "servos", "kind": "small",    "name": "Sharpened Strikers",   "requires": [],      "effect": { "dmg": 1 } },
      { "id": "sv2", "branch": "servos", "kind": "small",    "name": "Balanced Actuators",   "requires": ["sv1"], "effect": { "maxStBonus": 1 } },
      { "id": "svN1", "branch": "servos", "kind": "notable", "name": "Momentum Reclaimer",   "requires": ["sv2"],
        "desc": "A rear-strike kill vents 2 power back into the reserve.", "mech": { "key": "bsKillRefund", "power": 2 } },
      { "id": "sv3", "branch": "servos", "kind": "small",    "name": "Flanking Routines",    "requires": ["svN1"], "effect": { "bsBonus": 1 } },
      { "id": "sv4", "branch": "servos", "kind": "small",    "name": "Light Alloy Frame",    "requires": ["sv3"], "effect": { "rollCostDelta": -1 } },
      { "id": "svN2", "branch": "servos", "kind": "notable", "name": "Executioner Logic",    "requires": ["sv4"],
        "desc": "+1 strike damage against overloaded machines — folded into the hit before the riposte doubles it.", "mech": { "key": "staggerBonus", "power": 1 } },
      { "id": "sv5", "branch": "servos", "kind": "small",    "name": "Overvolted Blades",    "requires": ["svN2"], "effect": { "dmg": 1 } },
      { "id": "sv6", "branch": "servos", "kind": "small",    "name": "Deep Reserve",         "requires": ["sv5"], "effect": { "maxStBonus": 1 } },
      { "id": "svN3", "branch": "servos", "kind": "notable", "name": "Twin Actuators",       "requires": ["sv6"], "effect": { "dmg": 1, "bsBonus": 1 } },
      { "id": "sv7", "branch": "servos", "kind": "small",    "name": "Killing Geometry",     "requires": ["svN3"], "effect": { "bsBonus": 1 } },
      { "id": "sv8", "branch": "servos", "kind": "small",    "name": "Power Feed",           "requires": ["sv7"], "effect": { "maxStBonus": 1 } },
      { "id": "svK", "branch": "servos", "kind": "keystone", "name": "Glass Core",           "requires": ["sv8"],
        "desc": "Every safety margin re-routed into the strikers. Hit like a wrecking crew; get hit like glass.", "effect": { "dmg": 1, "bsBonus": 1, "maxHpBonus": -6 } },
      { "id": "svt1", "branch": "servos", "kind": "small",   "name": "Charge Coils",         "requires": ["sv2"], "effect": { "maxStBonus": 1 } },
      { "id": "svt2", "branch": "servos", "kind": "small",   "name": "Whetted Edges",        "requires": ["sv4"], "effect": { "dmg": 1 } },
      { "id": "svt3", "branch": "servos", "kind": "small",   "name": "Angle Solvers",        "requires": ["sv6"], "effect": { "bsBonus": 1 } },
      { "id": "svt4", "branch": "servos", "kind": "small",   "name": "Feed Regulators",      "requires": ["sv7"], "effect": { "maxStBonus": 1 } },
      { "id": "svJ",  "branch": "servos", "kind": "jewel",   "name": "Razor Prism",          "requires": ["svK"],
        "desc": "A cut core socketed past the keystone: the killing cluster grows from it.", "effect": { "dmg": 1 } },
      { "id": "svc1", "branch": "servos", "kind": "small",   "name": "Flenser Facet",        "requires": ["svJ"], "effect": { "bsBonus": 1 } },
      { "id": "svc2", "branch": "servos", "kind": "small",   "name": "Cleaver Facet",        "requires": ["svJ"], "effect": { "dmg": 1 } },
      { "id": "svc3", "branch": "servos", "kind": "notable", "name": "Executioner's Cut",    "requires": ["svc1", "svc2"], "effect": { "dmg": 1, "bsBonus": 1 } },

      { "id": "sy1", "branch": "systems", "kind": "small",    "name": "Wide-Band Optics",    "requires": [],      "effect": { "fovBonus": 1 } },
      { "id": "sy2", "branch": "systems", "kind": "small",    "name": "Core Magnetics",      "requires": ["sy1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syN1", "branch": "systems", "kind": "notable", "name": "Salvage Rites",       "requires": ["sy2"],
        "desc": "Prime kills yield one extra currency orb.", "mech": { "key": "eliteOrbBonus", "power": 1 } },
      { "id": "sy3", "branch": "systems", "kind": "small",    "name": "Refinery Loop",       "requires": ["syN1"], "effect": { "salvageMult": 0.1 } },
      { "id": "sy4", "branch": "systems", "kind": "small",    "name": "Signal Boosters",     "requires": ["sy3"], "effect": { "fovBonus": 1 } },
      { "id": "syN2", "branch": "systems", "kind": "notable", "name": "Deep-Cycle Scanners", "requires": ["sy4"],
        "desc": "Dropped gear rolls its modifiers 2 tiers deeper than the sector it fell in.", "mech": { "key": "lootDepthBonus", "power": 2 } },
      { "id": "sy5", "branch": "systems", "kind": "small",    "name": "Cargo Manifests",     "requires": ["syN2"], "effect": { "salvageMult": 0.15 } },
      { "id": "sy6", "branch": "systems", "kind": "small",    "name": "Auxiliary Cell",      "requires": ["sy5"], "effect": { "maxStBonus": 1 } },
      { "id": "syN3", "branch": "systems", "kind": "notable", "name": "Reclamation Protocol", "requires": ["sy6"], "effect": { "siphonOnKill": 1 } },
      { "id": "sy7", "branch": "systems", "kind": "small",    "name": "Long-Range Array",    "requires": ["syN3"], "effect": { "fovBonus": 1 } },
      { "id": "sy8", "branch": "systems", "kind": "small",    "name": "Ore Divination",      "requires": ["sy7"], "effect": { "salvageMult": 0.15 } },
      { "id": "syK", "branch": "systems", "kind": "keystone", "name": "Greed Circuit",       "requires": ["sy8"],
        "desc": "Every spare cycle diverted to acquisition. The Foundry pays out — and the deflector runs a beat behind.", "effect": { "salvageMult": 0.4, "fovBonus": 1, "parryCostDelta": 1 } },
      { "id": "syt1", "branch": "systems", "kind": "small",   "name": "Wide Apertures",      "requires": ["sy1"], "effect": { "fovBonus": 1 } },
      { "id": "syt2", "branch": "systems", "kind": "small",   "name": "Sorting Claws",       "requires": ["sy3"], "effect": { "salvageMult": 0.1 } },
      { "id": "syt3", "branch": "systems", "kind": "small",   "name": "Buffer Cells",        "requires": ["sy5"], "effect": { "maxStBonus": 1 } },
      { "id": "syt4", "branch": "systems", "kind": "small",   "name": "Assay Optics",        "requires": ["sy8"], "effect": { "salvageMult": 0.1 } },
      { "id": "syJ",  "branch": "systems", "kind": "jewel",   "name": "Prospector Prism",    "requires": ["syK"],
        "desc": "A cut core socketed past the keystone: the acquisition cluster grows from it.", "effect": { "salvageMult": 0.15 } },
      { "id": "syc1", "branch": "systems", "kind": "small",   "name": "Seeker Facet",        "requires": ["syJ"], "effect": { "fovBonus": 1 } },
      { "id": "syc2", "branch": "systems", "kind": "small",   "name": "Tithe Facet",         "requires": ["syJ"], "effect": { "salvageMult": 0.15 } },
      { "id": "syc3", "branch": "systems", "kind": "notable", "name": "Motherlode",          "requires": ["syc1", "syc2"], "effect": { "salvageMult": 0.25, "maxStBonus": 1 } },

      /* GENERATED-EXPANSION-BEGIN (emitted by tools/gen-tree.js: sub-arms off each spine notable, twigs + ring closures, deep vaults past the tip clusters, root-special amplifiers; deterministic — regenerate with the tool, do not hand-edit) */
      { "id": "chg1a1", "branch": "chassis", "kind": "small", "name": "Sintered Casing", "requires": ["chN1"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg1a2", "branch": "chassis", "kind": "small", "name": "Grafted Mantle", "requires": ["chg1a1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg1a3", "branch": "chassis", "kind": "small", "name": "Slagcast Revetment", "requires": ["chg1a2"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg1a4", "branch": "chassis", "kind": "small", "name": "Milled Stanchion", "requires": ["chg1a3"], "effect": { "maxStBonus": 1 } },
      { "id": "chg1a5", "branch": "chassis", "kind": "small", "name": "Banded Bulkhead", "requires": ["chg1a4"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg1a6", "branch": "chassis", "kind": "small", "name": "Sintered Keelson", "requires": ["chg1a5"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg1a7", "branch": "chassis", "kind": "small", "name": "Riveted Plating", "requires": ["chg1a6"], "effect": { "maxStBonus": 1 } },
      { "id": "chg1a8", "branch": "chassis", "kind": "notable", "name": "Welded Casing", "requires": ["chg1a7","chg1au2"],
        "desc": "A heavy junction in the plating web.", "effect": { "maxHpBonus": 4 } },
      { "id": "chg1at1", "branch": "chassis", "kind": "small", "name": "Welded Stanchion", "requires": ["chg1a2"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg1at2", "branch": "chassis", "kind": "small", "name": "Welded Cladding", "requires": ["chg1at1"], "effect": { "maxStBonus": 1 } },
      { "id": "chg1au1", "branch": "chassis", "kind": "small", "name": "Layered Casing", "requires": ["chg1a5"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg1au2", "branch": "chassis", "kind": "small", "name": "Milled Cladding", "requires": ["chg1au1"], "effect": { "maxStBonus": 1 } },
      { "id": "chg1b1", "branch": "chassis", "kind": "small", "name": "Banded Cladding", "requires": ["chN1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg1b2", "branch": "chassis", "kind": "small", "name": "Forged Plating", "requires": ["chg1b1"], "effect": { "maxStBonus": 1 } },
      { "id": "chg1b3", "branch": "chassis", "kind": "small", "name": "Tempered Keelson", "requires": ["chg1b2"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg1b4", "branch": "chassis", "kind": "small", "name": "Buttressed Gusset", "requires": ["chg1b3"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg1b5", "branch": "chassis", "kind": "small", "name": "Vaulted Berm", "requires": ["chg1b4"], "effect": { "maxStBonus": 1 } },
      { "id": "chg1b6", "branch": "chassis", "kind": "small", "name": "Sintered Mantle", "requires": ["chg1b5"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg1b7", "branch": "chassis", "kind": "small", "name": "Grafted Carapace", "requires": ["chg1b6"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg1b8", "branch": "chassis", "kind": "notable", "name": "Banded Truss", "requires": ["chg1b7","chg1bu2"],
        "desc": "A heavy junction in the plating web.", "effect": { "maxHpBonus": 2, "flaskHealBonus": 2 } },
      { "id": "chg1bt1", "branch": "chassis", "kind": "small", "name": "Ceramic Revetment", "requires": ["chg1b2"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg1bt2", "branch": "chassis", "kind": "small", "name": "Pinned Chine", "requires": ["chg1bt1"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg1bu1", "branch": "chassis", "kind": "small", "name": "Riveted Cladding", "requires": ["chg1b5"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg1bu2", "branch": "chassis", "kind": "small", "name": "Annealed Truss", "requires": ["chg1bu1"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg1x", "branch": "chassis", "kind": "small", "name": "Grafted Plating", "requires": ["chg1a3","chg1b3"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg2a1", "branch": "chassis", "kind": "small", "name": "Buttressed Mantle", "requires": ["chN2"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg2a2", "branch": "chassis", "kind": "small", "name": "Layered Gusset", "requires": ["chg2a1"], "effect": { "parryCostDelta": -1 } },
      { "id": "chg2a3", "branch": "chassis", "kind": "small", "name": "Welded Rib", "requires": ["chg2a2"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg2a4", "branch": "chassis", "kind": "small", "name": "Buttressed Revetment", "requires": ["chg2a3"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg2a5", "branch": "chassis", "kind": "small", "name": "Tempered Shell", "requires": ["chg2a4"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg2a6", "branch": "chassis", "kind": "small", "name": "Layered Course", "requires": ["chg2a5"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg2a7", "branch": "chassis", "kind": "small", "name": "Vaulted Course", "requires": ["chg2a6"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg2a8", "branch": "chassis", "kind": "notable", "name": "Ceramic Shell", "requires": ["chg2a7","chg2au2"],
        "desc": "A heavy junction in the plating web.", "effect": { "maxHpBonus": 2, "flaskHealBonus": 2 } },
      { "id": "chg2at1", "branch": "chassis", "kind": "small", "name": "Crowned Chine", "requires": ["chg2a2"], "effect": { "maxStBonus": 1 } },
      { "id": "chg2at2", "branch": "chassis", "kind": "small", "name": "Sintered Carapace", "requires": ["chg2at1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg2au1", "branch": "chassis", "kind": "small", "name": "Buttressed Carapace", "requires": ["chg2a5"], "effect": { "parryCostDelta": -1 } },
      { "id": "chg2au2", "branch": "chassis", "kind": "small", "name": "Milled Gusset", "requires": ["chg2au1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg2b1", "branch": "chassis", "kind": "small", "name": "Welded Truss", "requires": ["chN2"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg2b2", "branch": "chassis", "kind": "small", "name": "Vaulted Revetment", "requires": ["chg2b1"], "effect": { "maxStBonus": 1 } },
      { "id": "chg2b3", "branch": "chassis", "kind": "small", "name": "Milled Truss", "requires": ["chg2b2"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg2b4", "branch": "chassis", "kind": "small", "name": "Riveted Course", "requires": ["chg2b3"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg2b5", "branch": "chassis", "kind": "small", "name": "Ceramic Rib", "requires": ["chg2b4"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg2b6", "branch": "chassis", "kind": "small", "name": "Layered Berm", "requires": ["chg2b5"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg2b7", "branch": "chassis", "kind": "small", "name": "Annealed Rib", "requires": ["chg2b6"], "effect": { "maxStBonus": 1 } },
      { "id": "chg2b8", "branch": "chassis", "kind": "notable", "name": "Buttressed Chine", "requires": ["chg2b7","chg2bu2"],
        "desc": "A heavy junction in the plating web.", "effect": { "maxHpBonus": 4 } },
      { "id": "chg2bt1", "branch": "chassis", "kind": "small", "name": "Grafted Course", "requires": ["chg2b2"], "effect": { "maxStBonus": 1 } },
      { "id": "chg2bt2", "branch": "chassis", "kind": "small", "name": "Grafted Cladding", "requires": ["chg2bt1"], "effect": { "maxStBonus": 1 } },
      { "id": "chg2bu1", "branch": "chassis", "kind": "small", "name": "Milled Chine", "requires": ["chg2b5"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg2bu2", "branch": "chassis", "kind": "small", "name": "Crowned Keelson", "requires": ["chg2bu1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg2x", "branch": "chassis", "kind": "small", "name": "Crowned Course", "requires": ["chg2a3","chg2b3"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg3a1", "branch": "chassis", "kind": "small", "name": "Forged Cladding", "requires": ["chN3"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg3a2", "branch": "chassis", "kind": "small", "name": "Tempered Rib", "requires": ["chg3a1"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg3a3", "branch": "chassis", "kind": "small", "name": "Forged Casing", "requires": ["chg3a2"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg3a4", "branch": "chassis", "kind": "small", "name": "Grafted Revetment", "requires": ["chg3a3"], "effect": { "maxStBonus": 1 } },
      { "id": "chg3a5", "branch": "chassis", "kind": "small", "name": "Riveted Chine", "requires": ["chg3a4"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg3a6", "branch": "chassis", "kind": "small", "name": "Crowned Rib", "requires": ["chg3a5"], "effect": { "maxStBonus": 1 } },
      { "id": "chg3a7", "branch": "chassis", "kind": "small", "name": "Tempered Revetment", "requires": ["chg3a6"], "effect": { "maxStBonus": 1 } },
      { "id": "chg3a8", "branch": "chassis", "kind": "notable", "name": "Ceramic Cladding", "requires": ["chg3a7","chg3au2"],
        "desc": "A heavy junction in the plating web.", "effect": { "maxHpBonus": 4 } },
      { "id": "chg3at1", "branch": "chassis", "kind": "small", "name": "Crowned Truss", "requires": ["chg3a2"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg3at2", "branch": "chassis", "kind": "small", "name": "Ceramic Keelson", "requires": ["chg3at1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg3au1", "branch": "chassis", "kind": "small", "name": "Ceramic Gusset", "requires": ["chg3a5"], "effect": { "maxStBonus": 1 } },
      { "id": "chg3au2", "branch": "chassis", "kind": "small", "name": "Crowned Cladding", "requires": ["chg3au1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg3b1", "branch": "chassis", "kind": "small", "name": "Ceramic Mantle", "requires": ["chN3"], "effect": { "maxStBonus": 1 } },
      { "id": "chg3b2", "branch": "chassis", "kind": "small", "name": "Pinned Bulkhead", "requires": ["chg3b1"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg3b3", "branch": "chassis", "kind": "small", "name": "Vaulted Bulkhead", "requires": ["chg3b2"], "effect": { "maxStBonus": 1 } },
      { "id": "chg3b4", "branch": "chassis", "kind": "small", "name": "Sintered Chine", "requires": ["chg3b3"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg3b5", "branch": "chassis", "kind": "small", "name": "Forged Rib", "requires": ["chg3b4"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg3b6", "branch": "chassis", "kind": "small", "name": "Forged Stanchion", "requires": ["chg3b5"], "effect": { "maxStBonus": 1 } },
      { "id": "chg3b7", "branch": "chassis", "kind": "small", "name": "Crowned Revetment", "requires": ["chg3b6"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg3b8", "branch": "chassis", "kind": "notable", "name": "Annealed Course", "requires": ["chg3b7","chg3bu2"],
        "desc": "A heavy junction in the plating web.", "effect": { "maxHpBonus": 2, "flaskHealBonus": 2 } },
      { "id": "chg3bt1", "branch": "chassis", "kind": "small", "name": "Riveted Berm", "requires": ["chg3b2"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg3bt2", "branch": "chassis", "kind": "small", "name": "Welded Plating", "requires": ["chg3bt1"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg3bu1", "branch": "chassis", "kind": "small", "name": "Ceramic Plating", "requires": ["chg3b5"], "effect": { "flaskHealBonus": 2 } },
      { "id": "chg3bu2", "branch": "chassis", "kind": "small", "name": "Tempered Carapace", "requires": ["chg3bu1"], "effect": { "maxHpBonus": 2 } },
      { "id": "chg3x", "branch": "chassis", "kind": "small", "name": "Forged Truss", "requires": ["chg3a3","chg3b3"], "effect": { "maxHpBonus": 2 } },
      { "id": "chv1", "branch": "chassis", "kind": "small", "name": "Ceramic Truss", "requires": ["chc3"], "effect": { "maxHpBonus": 2 } },
      { "id": "chv2", "branch": "chassis", "kind": "small", "name": "Annealed Cladding", "requires": ["chv1"], "effect": { "maxHpBonus": 2 } },
      { "id": "chv3", "branch": "chassis", "kind": "small", "name": "Banded Shell", "requires": ["chv2"], "effect": { "maxHpBonus": 2 } },
      { "id": "chvN", "branch": "chassis", "kind": "notable", "name": "Sintered Bulkhead", "requires": ["chv3"],
        "desc": "The deflector's vented charge doubles back once more: +1 power refunded on a successful deflect.", "mech": { "key": "parryRefund", "power": 1 }, "effect": { "maxHpBonus": 3 } },
      { "id": "svg1a1", "branch": "servos", "kind": "small", "name": "Torqued Crank", "requires": ["svN1"], "effect": { "maxStBonus": 1 } },
      { "id": "svg1a2", "branch": "servos", "kind": "small", "name": "Balanced Lash", "requires": ["svg1a1"], "effect": { "bsBonus": 1 } },
      { "id": "svg1a3", "branch": "servos", "kind": "small", "name": "Ratcheted Actuator", "requires": ["svg1a2"], "effect": { "maxStBonus": 1 } },
      { "id": "svg1a4", "branch": "servos", "kind": "small", "name": "Overwound Rocker", "requires": ["svg1a3"], "effect": { "flaskHealBonus": 2 } },
      { "id": "svg1a5", "branch": "servos", "kind": "small", "name": "Sprung Follower", "requires": ["svg1a4"], "effect": { "maxStBonus": 1 } },
      { "id": "svg1a6", "branch": "servos", "kind": "small", "name": "Oiled Flywheel", "requires": ["svg1a5"], "effect": { "maxStBonus": 1 } },
      { "id": "svg1a7", "branch": "servos", "kind": "small", "name": "Flexed Talon", "requires": ["svg1a6"], "effect": { "maxStBonus": 1 } },
      { "id": "svg1a8", "branch": "servos", "kind": "notable", "name": "Oiled Piston", "requires": ["svg1a7","svg1au2"],
        "desc": "A killing junction in the drive train.", "effect": { "bsBonus": 2, "dmg": 1 } },
      { "id": "svg1at1", "branch": "servos", "kind": "small", "name": "Keened Escapement", "requires": ["svg1a2"], "effect": { "bsBonus": 1 } },
      { "id": "svg1at2", "branch": "servos", "kind": "small", "name": "Balanced Tendon", "requires": ["svg1at1"], "effect": { "bsBonus": 1 } },
      { "id": "svg1au1", "branch": "servos", "kind": "small", "name": "Geared Escapement", "requires": ["svg1a5"], "effect": { "bsBonus": 1 } },
      { "id": "svg1au2", "branch": "servos", "kind": "small", "name": "Sprung Lash", "requires": ["svg1au1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "svg1b1", "branch": "servos", "kind": "small", "name": "Tuned Knuckle", "requires": ["svN1"], "effect": { "maxStBonus": 1 } },
      { "id": "svg1b2", "branch": "servos", "kind": "small", "name": "Whetted Rocker", "requires": ["svg1b1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "svg1b3", "branch": "servos", "kind": "small", "name": "Torqued Actuator", "requires": ["svg1b2"], "effect": { "maxStBonus": 1 } },
      { "id": "svg1b4", "branch": "servos", "kind": "small", "name": "Geared Striker", "requires": ["svg1b3"], "effect": { "maxStBonus": 1 } },
      { "id": "svg1b5", "branch": "servos", "kind": "small", "name": "Snapped Flywheel", "requires": ["svg1b4"], "effect": { "bsBonus": 1 } },
      { "id": "svg1b6", "branch": "servos", "kind": "small", "name": "Snapped Knuckle", "requires": ["svg1b5"], "effect": { "bsBonus": 1 } },
      { "id": "svg1b7", "branch": "servos", "kind": "small", "name": "Cammed Striker", "requires": ["svg1b6"], "effect": { "flaskHealBonus": 2 } },
      { "id": "svg1b8", "branch": "servos", "kind": "notable", "name": "Flexed Rocker", "requires": ["svg1b7","svg1bu2"],
        "desc": "A killing junction in the drive train.", "effect": { "bsBonus": 2, "maxStBonus": 1 } },
      { "id": "svg1bt1", "branch": "servos", "kind": "small", "name": "Keened Knuckle", "requires": ["svg1b2"], "effect": { "bsBonus": 1 } },
      { "id": "svg1bt2", "branch": "servos", "kind": "small", "name": "Snapped Talon", "requires": ["svg1bt1"], "effect": { "rollCostDelta": -1 } },
      { "id": "svg1bu1", "branch": "servos", "kind": "small", "name": "Ratcheted Follower", "requires": ["svg1b5"], "effect": { "dmg": 1 } },
      { "id": "svg1bu2", "branch": "servos", "kind": "small", "name": "Snapped Follower", "requires": ["svg1bu1"], "effect": { "maxStBonus": 1 } },
      { "id": "svg1x", "branch": "servos", "kind": "small", "name": "Cammed Talon", "requires": ["svg1a3","svg1b3"], "effect": { "bsBonus": 1 } },
      { "id": "svg2a1", "branch": "servos", "kind": "small", "name": "Balanced Flywheel", "requires": ["svN2"], "effect": { "bsBonus": 1 } },
      { "id": "svg2a2", "branch": "servos", "kind": "small", "name": "Oiled Rocker", "requires": ["svg2a1"], "effect": { "maxStBonus": 1 } },
      { "id": "svg2a3", "branch": "servos", "kind": "small", "name": "Coiled Follower", "requires": ["svg2a2"], "effect": { "rollCostDelta": -1 } },
      { "id": "svg2a4", "branch": "servos", "kind": "small", "name": "Keened Flywheel", "requires": ["svg2a3"], "effect": { "dmg": 1 } },
      { "id": "svg2a5", "branch": "servos", "kind": "small", "name": "Ratcheted Striker", "requires": ["svg2a4"], "effect": { "bsBonus": 1 } },
      { "id": "svg2a6", "branch": "servos", "kind": "small", "name": "Overwound Flywheel", "requires": ["svg2a5"], "effect": { "maxStBonus": 1 } },
      { "id": "svg2a7", "branch": "servos", "kind": "small", "name": "Tuned Tappet", "requires": ["svg2a6"], "effect": { "maxStBonus": 1 } },
      { "id": "svg2a8", "branch": "servos", "kind": "notable", "name": "Geared Tappet", "requires": ["svg2a7","svg2au2"],
        "desc": "A killing junction in the drive train.", "effect": { "bsBonus": 2, "maxStBonus": 1 } },
      { "id": "svg2at1", "branch": "servos", "kind": "small", "name": "Tuned Escapement", "requires": ["svg2a2"], "effect": { "maxStBonus": 1 } },
      { "id": "svg2at2", "branch": "servos", "kind": "small", "name": "Tuned Follower", "requires": ["svg2at1"], "effect": { "bsBonus": 1 } },
      { "id": "svg2au1", "branch": "servos", "kind": "small", "name": "Flexed Striker", "requires": ["svg2a5"], "effect": { "maxStBonus": 1 } },
      { "id": "svg2au2", "branch": "servos", "kind": "small", "name": "Counterweighted Actuator", "requires": ["svg2au1"], "effect": { "bsBonus": 1 } },
      { "id": "svg2b1", "branch": "servos", "kind": "small", "name": "Counterweighted Escapement", "requires": ["svN2"], "effect": { "bsBonus": 1 } },
      { "id": "svg2b2", "branch": "servos", "kind": "small", "name": "Keened Rocker", "requires": ["svg2b1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "svg2b3", "branch": "servos", "kind": "small", "name": "Whetted Piston", "requires": ["svg2b2"], "effect": { "dmg": 1 } },
      { "id": "svg2b4", "branch": "servos", "kind": "small", "name": "Ratcheted Rocker", "requires": ["svg2b3"], "effect": { "flaskHealBonus": 2 } },
      { "id": "svg2b5", "branch": "servos", "kind": "small", "name": "Cammed Linkage", "requires": ["svg2b4"], "effect": { "bsBonus": 1 } },
      { "id": "svg2b6", "branch": "servos", "kind": "small", "name": "Trued Flywheel", "requires": ["svg2b5"], "effect": { "maxStBonus": 1 } },
      { "id": "svg2b7", "branch": "servos", "kind": "small", "name": "Tuned Actuator", "requires": ["svg2b6"], "effect": { "bsBonus": 1 } },
      { "id": "svg2b8", "branch": "servos", "kind": "notable", "name": "Overwound Actuator", "requires": ["svg2b7","svg2bu2"],
        "desc": "A killing junction in the drive train.", "effect": { "bsBonus": 2, "dmg": 1 } },
      { "id": "svg2bt1", "branch": "servos", "kind": "small", "name": "Keened Lash", "requires": ["svg2b2"], "effect": { "maxStBonus": 1 } },
      { "id": "svg2bt2", "branch": "servos", "kind": "small", "name": "Counterweighted Mainspring", "requires": ["svg2bt1"], "effect": { "maxStBonus": 1 } },
      { "id": "svg2bu1", "branch": "servos", "kind": "small", "name": "Ratcheted Lash", "requires": ["svg2b5"], "effect": { "maxStBonus": 1 } },
      { "id": "svg2bu2", "branch": "servos", "kind": "small", "name": "Ratcheted Mainspring", "requires": ["svg2bu1"], "effect": { "maxStBonus": 1 } },
      { "id": "svg2x", "branch": "servos", "kind": "small", "name": "Sprung Crank", "requires": ["svg2a3","svg2b3"], "effect": { "bsBonus": 1 } },
      { "id": "svg3a1", "branch": "servos", "kind": "small", "name": "Counterweighted Tendon", "requires": ["svN3"], "effect": { "bsBonus": 1 } },
      { "id": "svg3a2", "branch": "servos", "kind": "small", "name": "Geared Piston", "requires": ["svg3a1"], "effect": { "bsBonus": 1 } },
      { "id": "svg3a3", "branch": "servos", "kind": "small", "name": "Geared Crank", "requires": ["svg3a2"], "effect": { "flaskHealBonus": 2 } },
      { "id": "svg3a4", "branch": "servos", "kind": "small", "name": "Oiled Talon", "requires": ["svg3a3"], "effect": { "bsBonus": 1 } },
      { "id": "svg3a5", "branch": "servos", "kind": "small", "name": "Overwound Piston", "requires": ["svg3a4"], "effect": { "maxStBonus": 1 } },
      { "id": "svg3a6", "branch": "servos", "kind": "small", "name": "Whetted Sprocket", "requires": ["svg3a5"], "effect": { "maxStBonus": 1 } },
      { "id": "svg3a7", "branch": "servos", "kind": "small", "name": "Overwound Linkage", "requires": ["svg3a6"], "effect": { "bsBonus": 1 } },
      { "id": "svg3a8", "branch": "servos", "kind": "notable", "name": "Oiled Striker", "requires": ["svg3a7","svg3au2"],
        "desc": "A killing junction in the drive train.", "effect": { "bsBonus": 2, "dmg": 1 } },
      { "id": "svg3at1", "branch": "servos", "kind": "small", "name": "Snapped Lash", "requires": ["svg3a2"], "effect": { "bsBonus": 1 } },
      { "id": "svg3at2", "branch": "servos", "kind": "small", "name": "Overwound Crank", "requires": ["svg3at1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "svg3au1", "branch": "servos", "kind": "small", "name": "Keened Talon", "requires": ["svg3a5"], "effect": { "flaskHealBonus": 2 } },
      { "id": "svg3au2", "branch": "servos", "kind": "small", "name": "Counterweighted Rocker", "requires": ["svg3au1"], "effect": { "bsBonus": 1 } },
      { "id": "svg3b1", "branch": "servos", "kind": "small", "name": "Overwound Striker", "requires": ["svN3"], "effect": { "maxStBonus": 1 } },
      { "id": "svg3b2", "branch": "servos", "kind": "small", "name": "Oiled Escapement", "requires": ["svg3b1"], "effect": { "bsBonus": 1 } },
      { "id": "svg3b3", "branch": "servos", "kind": "small", "name": "Torqued Knuckle", "requires": ["svg3b2"], "effect": { "bsBonus": 1 } },
      { "id": "svg3b4", "branch": "servos", "kind": "small", "name": "Geared Flywheel", "requires": ["svg3b3"], "effect": { "bsBonus": 1 } },
      { "id": "svg3b5", "branch": "servos", "kind": "small", "name": "Trued Linkage", "requires": ["svg3b4"], "effect": { "bsBonus": 1 } },
      { "id": "svg3b6", "branch": "servos", "kind": "small", "name": "Snapped Crank", "requires": ["svg3b5"], "effect": { "flaskHealBonus": 2 } },
      { "id": "svg3b7", "branch": "servos", "kind": "small", "name": "Counterweighted Crank", "requires": ["svg3b6"], "effect": { "flaskHealBonus": 2 } },
      { "id": "svg3b8", "branch": "servos", "kind": "notable", "name": "Whetted Talon", "requires": ["svg3b7","svg3bu2"],
        "desc": "A killing junction in the drive train.", "effect": { "bsBonus": 2, "maxStBonus": 1 } },
      { "id": "svg3bt1", "branch": "servos", "kind": "small", "name": "Torqued Rocker", "requires": ["svg3b2"], "effect": { "bsBonus": 1 } },
      { "id": "svg3bt2", "branch": "servos", "kind": "small", "name": "Balanced Escapement", "requires": ["svg3bt1"], "effect": { "maxStBonus": 1 } },
      { "id": "svg3bu1", "branch": "servos", "kind": "small", "name": "Counterweighted Striker", "requires": ["svg3b5"], "effect": { "bsBonus": 1 } },
      { "id": "svg3bu2", "branch": "servos", "kind": "small", "name": "Coiled Flywheel", "requires": ["svg3bu1"], "effect": { "dmg": 1 } },
      { "id": "svg3x", "branch": "servos", "kind": "small", "name": "Torqued Striker", "requires": ["svg3a3","svg3b3"], "effect": { "bsBonus": 1 } },
      { "id": "svv1", "branch": "servos", "kind": "small", "name": "Oiled Crank", "requires": ["svc3"], "effect": { "bsBonus": 1 } },
      { "id": "svv2", "branch": "servos", "kind": "small", "name": "Sprung Tendon", "requires": ["svv1"], "effect": { "bsBonus": 1 } },
      { "id": "svv3", "branch": "servos", "kind": "small", "name": "Cammed Mainspring", "requires": ["svv2"], "effect": { "bsBonus": 1 } },
      { "id": "svvN", "branch": "servos", "kind": "notable", "name": "Snapped Mainspring", "requires": ["svv3"],
        "desc": "The reclaimer taps deeper: +1 more power vented back on a rear-strike kill.", "mech": { "key": "bsKillRefund", "power": 1 }, "effect": { "bsBonus": 2 } },
      { "id": "syg1a1", "branch": "systems", "kind": "small", "name": "Doped Waveguide", "requires": ["syN1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg1a2", "branch": "systems", "kind": "small", "name": "Attuned Dowser", "requires": ["syg1a1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg1a3", "branch": "systems", "kind": "small", "name": "Spectral Waveguide", "requires": ["syg1a2"], "effect": { "maxStBonus": 1 } },
      { "id": "syg1a4", "branch": "systems", "kind": "small", "name": "Cached Antenna", "requires": ["syg1a3"], "effect": { "maxStBonus": 1 } },
      { "id": "syg1a5", "branch": "systems", "kind": "small", "name": "Etched Sieve", "requires": ["syg1a4"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg1a6", "branch": "systems", "kind": "small", "name": "Cached Sieve", "requires": ["syg1a5"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg1a7", "branch": "systems", "kind": "small", "name": "Polarized Dowser", "requires": ["syg1a6"], "effect": { "flaskHealBonus": 2 } },
      { "id": "syg1a8", "branch": "systems", "kind": "notable", "name": "Calibrated Assay", "requires": ["syg1a7","syg1au2"],
        "desc": "A rich junction in the scanner web.", "effect": { "salvageMult": 0.2, "fovBonus": 1 } },
      { "id": "syg1at1", "branch": "systems", "kind": "small", "name": "Spectral Optic", "requires": ["syg1a2"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg1at2", "branch": "systems", "kind": "small", "name": "Calibrated Sensorium", "requires": ["syg1at1"], "effect": { "maxStBonus": 1 } },
      { "id": "syg1au1", "branch": "systems", "kind": "small", "name": "Filtered Register", "requires": ["syg1a5"], "effect": { "maxStBonus": 1 } },
      { "id": "syg1au2", "branch": "systems", "kind": "small", "name": "Cached Sounder", "requires": ["syg1au1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg1b1", "branch": "systems", "kind": "small", "name": "Etched Register", "requires": ["syN1"], "effect": { "maxStBonus": 1 } },
      { "id": "syg1b2", "branch": "systems", "kind": "small", "name": "Trawling Prospect", "requires": ["syg1b1"], "effect": { "maxStBonus": 1 } },
      { "id": "syg1b3", "branch": "systems", "kind": "small", "name": "Doped Prospect", "requires": ["syg1b2"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg1b4", "branch": "systems", "kind": "small", "name": "Indexed Sounder", "requires": ["syg1b3"], "effect": { "flaskHealBonus": 2 } },
      { "id": "syg1b5", "branch": "systems", "kind": "small", "name": "Threaded Manifest", "requires": ["syg1b4"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg1b6", "branch": "systems", "kind": "small", "name": "Trawling Optic", "requires": ["syg1b5"], "effect": { "maxStBonus": 1 } },
      { "id": "syg1b7", "branch": "systems", "kind": "small", "name": "Calibrated Optic", "requires": ["syg1b6"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg1b8", "branch": "systems", "kind": "notable", "name": "Filtered Prospect", "requires": ["syg1b7","syg1bu2"],
        "desc": "A rich junction in the scanner web.", "effect": { "salvageMult": 0.15, "maxStBonus": 1 } },
      { "id": "syg1bt1", "branch": "systems", "kind": "small", "name": "Etched Beacon", "requires": ["syg1b2"], "effect": { "maxStBonus": 1 } },
      { "id": "syg1bt2", "branch": "systems", "kind": "small", "name": "Harmonic Antenna", "requires": ["syg1bt1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "syg1bu1", "branch": "systems", "kind": "small", "name": "Calibrated Dowser", "requires": ["syg1b5"], "effect": { "maxStBonus": 1 } },
      { "id": "syg1bu2", "branch": "systems", "kind": "small", "name": "Manifold Waveguide", "requires": ["syg1bu1"], "effect": { "maxStBonus": 1 } },
      { "id": "syg1x", "branch": "systems", "kind": "small", "name": "Spectral Assay", "requires": ["syg1a3","syg1b3"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2a1", "branch": "systems", "kind": "small", "name": "Phased Antenna", "requires": ["syN2"], "effect": { "maxStBonus": 1 } },
      { "id": "syg2a2", "branch": "systems", "kind": "small", "name": "Doped Sounder", "requires": ["syg2a1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2a3", "branch": "systems", "kind": "small", "name": "Attuned Prospect", "requires": ["syg2a2"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2a4", "branch": "systems", "kind": "small", "name": "Phased Manifest", "requires": ["syg2a3"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2a5", "branch": "systems", "kind": "small", "name": "Indexed Register", "requires": ["syg2a4"], "effect": { "maxStBonus": 1 } },
      { "id": "syg2a6", "branch": "systems", "kind": "small", "name": "Doped Beacon", "requires": ["syg2a5"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2a7", "branch": "systems", "kind": "small", "name": "Resonant Sounder", "requires": ["syg2a6"], "effect": { "fovBonus": 1 } },
      { "id": "syg2a8", "branch": "systems", "kind": "notable", "name": "Resonant Optic", "requires": ["syg2a7","syg2au2"],
        "desc": "A rich junction in the scanner web.", "effect": { "salvageMult": 0.15, "maxStBonus": 1 } },
      { "id": "syg2at1", "branch": "systems", "kind": "small", "name": "Indexed Optic", "requires": ["syg2a2"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2at2", "branch": "systems", "kind": "small", "name": "Polarized Ledger", "requires": ["syg2at1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2au1", "branch": "systems", "kind": "small", "name": "Etched Tally", "requires": ["syg2a5"], "effect": { "flaskHealBonus": 2 } },
      { "id": "syg2au2", "branch": "systems", "kind": "small", "name": "Resonant Beacon", "requires": ["syg2au1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2b1", "branch": "systems", "kind": "small", "name": "Doped Cortex", "requires": ["syN2"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2b2", "branch": "systems", "kind": "small", "name": "Trawling Register", "requires": ["syg2b1"], "effect": { "maxStBonus": 1 } },
      { "id": "syg2b3", "branch": "systems", "kind": "small", "name": "Resonant Sieve", "requires": ["syg2b2"], "effect": { "fovBonus": 1 } },
      { "id": "syg2b4", "branch": "systems", "kind": "small", "name": "Polarized Sounder", "requires": ["syg2b3"], "effect": { "flaskHealBonus": 2 } },
      { "id": "syg2b5", "branch": "systems", "kind": "small", "name": "Cached Ledger", "requires": ["syg2b4"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2b6", "branch": "systems", "kind": "small", "name": "Attuned Assay", "requires": ["syg2b5"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2b7", "branch": "systems", "kind": "small", "name": "Threaded Optic", "requires": ["syg2b6"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2b8", "branch": "systems", "kind": "notable", "name": "Trawling Sensorium", "requires": ["syg2b7","syg2bu2"],
        "desc": "A rich junction in the scanner web.", "effect": { "salvageMult": 0.2, "fovBonus": 1 } },
      { "id": "syg2bt1", "branch": "systems", "kind": "small", "name": "Polarized Optic", "requires": ["syg2b2"], "effect": { "flaskHealBonus": 2 } },
      { "id": "syg2bt2", "branch": "systems", "kind": "small", "name": "Spectral Register", "requires": ["syg2bt1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2bu1", "branch": "systems", "kind": "small", "name": "Phased Sensorium", "requires": ["syg2b5"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2bu2", "branch": "systems", "kind": "small", "name": "Indexed Prospect", "requires": ["syg2bu1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg2x", "branch": "systems", "kind": "small", "name": "Indexed Detector", "requires": ["syg2a3","syg2b3"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg3a1", "branch": "systems", "kind": "small", "name": "Indexed Beacon", "requires": ["syN3"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg3a2", "branch": "systems", "kind": "small", "name": "Sifting Antenna", "requires": ["syg3a1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg3a3", "branch": "systems", "kind": "small", "name": "Etched Detector", "requires": ["syg3a2"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg3a4", "branch": "systems", "kind": "small", "name": "Cached Manifest", "requires": ["syg3a3"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg3a5", "branch": "systems", "kind": "small", "name": "Indexed Sieve", "requires": ["syg3a4"], "effect": { "maxStBonus": 1 } },
      { "id": "syg3a6", "branch": "systems", "kind": "small", "name": "Harmonic Waveguide", "requires": ["syg3a5"], "effect": { "flaskHealBonus": 2 } },
      { "id": "syg3a7", "branch": "systems", "kind": "small", "name": "Manifold Sieve", "requires": ["syg3a6"], "effect": { "maxStBonus": 1 } },
      { "id": "syg3a8", "branch": "systems", "kind": "notable", "name": "Phased Register", "requires": ["syg3a7","syg3au2"],
        "desc": "A rich junction in the scanner web.", "effect": { "salvageMult": 0.2, "fovBonus": 1 } },
      { "id": "syg3at1", "branch": "systems", "kind": "small", "name": "Attuned Beacon", "requires": ["syg3a2"], "effect": { "flaskHealBonus": 2 } },
      { "id": "syg3at2", "branch": "systems", "kind": "small", "name": "Harmonic Cortex", "requires": ["syg3at1"], "effect": { "maxStBonus": 1 } },
      { "id": "syg3au1", "branch": "systems", "kind": "small", "name": "Spectral Manifest", "requires": ["syg3a5"], "effect": { "flaskHealBonus": 2 } },
      { "id": "syg3au2", "branch": "systems", "kind": "small", "name": "Sifting Optic", "requires": ["syg3au1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg3b1", "branch": "systems", "kind": "small", "name": "Manifold Register", "requires": ["syN3"], "effect": { "maxStBonus": 1 } },
      { "id": "syg3b2", "branch": "systems", "kind": "small", "name": "Polarized Prospect", "requires": ["syg3b1"], "effect": { "maxStBonus": 1 } },
      { "id": "syg3b3", "branch": "systems", "kind": "small", "name": "Calibrated Prospect", "requires": ["syg3b2"], "effect": { "fovBonus": 1 } },
      { "id": "syg3b4", "branch": "systems", "kind": "small", "name": "Filtered Waveguide", "requires": ["syg3b3"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg3b5", "branch": "systems", "kind": "small", "name": "Cached Prospect", "requires": ["syg3b4"], "effect": { "maxStBonus": 1 } },
      { "id": "syg3b6", "branch": "systems", "kind": "small", "name": "Indexed Cortex", "requires": ["syg3b5"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg3b7", "branch": "systems", "kind": "small", "name": "Etched Waveguide", "requires": ["syg3b6"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg3b8", "branch": "systems", "kind": "notable", "name": "Threaded Sensorium", "requires": ["syg3b7","syg3bu2"],
        "desc": "A rich junction in the scanner web.", "effect": { "salvageMult": 0.15, "maxStBonus": 1 } },
      { "id": "syg3bt1", "branch": "systems", "kind": "small", "name": "Cached Optic", "requires": ["syg3b2"], "effect": { "flaskHealBonus": 2 } },
      { "id": "syg3bt2", "branch": "systems", "kind": "small", "name": "Cached Waveguide", "requires": ["syg3bt1"], "effect": { "flaskHealBonus": 2 } },
      { "id": "syg3bu1", "branch": "systems", "kind": "small", "name": "Doped Assay", "requires": ["syg3b5"], "effect": { "salvageMult": 0.1 } },
      { "id": "syg3bu2", "branch": "systems", "kind": "small", "name": "Resonant Detector", "requires": ["syg3bu1"], "effect": { "maxStBonus": 1 } },
      { "id": "syg3x", "branch": "systems", "kind": "small", "name": "Sifting Prospect", "requires": ["syg3a3","syg3b3"], "effect": { "salvageMult": 0.1 } },
      { "id": "syv1", "branch": "systems", "kind": "small", "name": "Polarized Sensorium", "requires": ["syc3"], "effect": { "salvageMult": 0.1 } },
      { "id": "syv2", "branch": "systems", "kind": "small", "name": "Spectral Prospect", "requires": ["syv1"], "effect": { "salvageMult": 0.1 } },
      { "id": "syv3", "branch": "systems", "kind": "small", "name": "Doped Register", "requires": ["syv2"], "effect": { "salvageMult": 0.1 } },
      { "id": "syvN", "branch": "systems", "kind": "notable", "name": "Attuned Sounder", "requires": ["syv3"],
        "desc": "The rites go deeper: Prime kills pay one more currency orb.", "mech": { "key": "eliteOrbBonus", "power": 1 }, "effect": { "salvageMult": 0.2 } },
      { "id": "spSlamA1", "branch": "root", "kind": "small", "name": "Overload Damper", "requires": ["spSlam"], "effect": { "maxHpBonus": 2 } },
      { "id": "spSlamA2", "branch": "root", "kind": "small", "name": "Overload Reservoir", "requires": ["spSlam"], "effect": { "maxStBonus": 1 } },
      { "id": "spSlamA3", "branch": "root", "kind": "small", "name": "Overload Harmonics", "requires": ["spSlamA1","spSlamA2"], "effect": { "maxHpBonus": 2 } },
      { "id": "spChargeA1", "branch": "root", "kind": "small", "name": "Rail Shunt", "requires": ["spCharge"], "effect": { "bsBonus": 1 } },
      { "id": "spChargeA2", "branch": "root", "kind": "small", "name": "Rail Capacitor", "requires": ["spCharge"], "effect": { "maxStBonus": 1 } },
      { "id": "spChargeA3", "branch": "root", "kind": "small", "name": "Rail Harmonics", "requires": ["spChargeA1","spChargeA2"], "effect": { "rollCostDelta": -1 } },
      { "id": "spBarrageA1", "branch": "root", "kind": "small", "name": "Volley Rifling", "requires": ["spBarrage"], "effect": { "fovBonus": 1 } },
      { "id": "spBarrageA2", "branch": "root", "kind": "small", "name": "Volley Magazine", "requires": ["spBarrage"], "effect": { "maxStBonus": 1 } },
      { "id": "spBarrageA3", "branch": "root", "kind": "small", "name": "Volley Harmonics", "requires": ["spBarrageA1","spBarrageA2"], "effect": { "dmg": 1 } },
      /* GENERATED-EXPANSION-END */
    ]
  },

  "items": {
    // rarity crafting caps: how many prefixes/suffixes each grade can hold
    "rarityCaps": {
      "normal": { "maxPrefix": 0, "maxSuffix": 0 },
      "magic":  { "maxPrefix": 1, "maxSuffix": 1 },
      "rare":   { "maxPrefix": 2, "maxSuffix": 2 },
      "unique": { "maxPrefix": 0, "maxSuffix": 0 }
    },
    // Sector Key crafting caps (mirrors rarityCaps' shape but for keys —
    // a key only ever needs one number, its total mod slots)
    "keyModCap": { "normal": 0, "magic": 2, "rare": 4 },
    // base type numbers; slot/name/desc/cleave/reach (weapon-archetype
    // behavior flags read by the attack code) stay in rl.js as identity.
    // Each implicit stat is a [min,max] roll range at depth 1 (like PoE2:
    // every item of a base type always carries it, but the rolled value
    // varies item to item) — see implicitScaling below for how the range
    // grows with sector depth. An empty {} means the base carries none.
    "baseTypes": {
      // each weapon's implicit stat echoes its own flavor: blade is the
      // balanced generalist (raw dmg), shiv is built to punish an exposed
      // core (bsBonus), cleaver's discharge burns 2 power so it gets more
      // reserve to fuel it (maxStBonus), lance's reach implicit extends
      // engagement range the same way sensor gear does (fovBonus)
      "blade":     { "implicit": { "dmg": { "min": 1, "max": 2 } }, "dmg": 2, "atkCost": 1, "rollCost": 2, "bsBonus": 2 },
      "shiv":      { "implicit": { "bsBonus": { "min": 1, "max": 2 } }, "dmg": 1, "atkCost": 1, "rollCost": 1, "bsBonus": 4 },
      "cleaver":   { "implicit": { "maxStBonus": { "min": 1, "max": 2 } }, "dmg": 4, "atkCost": 2, "rollCost": 2, "bsBonus": 2 },
      "lance":     { "implicit": { "fovBonus": { "min": 1, "max": 2 } }, "dmg": 2, "atkCost": 1, "rollCost": 2, "bsBonus": 2 },
      "plating":   { "implicit": { "maxHpBonus": { "min": 2, "max": 4 } } },
      "bulkhead":  { "implicit": { "maxHpBonus": { "min": 4, "max": 6 }, "rollCostDelta": { "min": 1, "max": 2 } } },
      "optics":    { "implicit": { "bsBonus": { "min": 1, "max": 3 } } },
      "array":     { "implicit": { "fovBonus": { "min": 1, "max": 2 } } },
      "servo":     { "implicit": { "rollCostDelta": { "min": -2, "max": -1 } } },
      "regulator": { "implicit": { "flaskHealBonus": { "min": 2, "max": 4 } } },
      "capacitor": { "implicit": { "maxStBonus": { "min": 1, "max": 2 } } },
      "recycler":  { "implicit": { "salvageMult": { "min": 0.25, "max": 0.4 } } },
      // siphonOnKill is a boolean gate in combat (>0 triggers it), same as
      // its suffix pool's flat tiers — a roll range here would be fake
      // precision with no gameplay effect, so it stays fixed at 1
      "reclaimer": { "implicit": { "siphonOnKill": { "min": 1, "max": 1 } } },
      "dampener":  { "implicit": { "parryCostDelta": { "min": -2, "max": -1 } } }
    },
    // both bounds of every implicit range scale by this factor as sector
    // depth grows: scale = 1 + growthPerDepthTier * (depth - 1). Negative
    // ranges (rollCostDelta/parryCostDelta benefits) scale the same way,
    // which grows their magnitude correctly since the sign never flips.
    "implicitScaling": { "growthPerDepthTier": 0.06 },
    // affix magnitudes past the gate ladder: a rolled affix's tier value is
    // multiplied by 1 + growthPerDepth * max(0, depth - startDepth), the
    // same linear shape implicits use — so once tiers go open-ended (see
    // levelGen.sector.keyDropAheadPostLadder) gear keeps pace forever
    // instead of flatlining at the tier-5 tables above. startDepth 16 is
    // T15's own depth: everything through the ladder rolls exactly the
    // tuned tables, growth begins at T16.
    "affixDeepScaling": { "startDepth": 16, "growthPerDepth": 0.06 },
    "bareFists": { "dmg": 1, "atkCost": 1, "rollCost": 2, "bsBonus": 0 },
    // affix pools: prefixes carry raw power, suffixes carry utility. Five
    // tiers each; deeper sectors roll higher tiers per affixTierBands.
    // names travel with their tier magnitudes since they're the same
    // logical row (tier 3 dmg IS "Merciless"); one mod per stat per item.
    // "slots" restricts which base-type slots (weapon/plating/sensor/
    // drive/utility) can roll this affix — null means unrestricted, which
    // is every entry below today: any item can roll any modifier. That's
    // deliberate for now; set an array like ["weapon","sensor"] on an
    // entry to gate it, no code change needed.
    "prefixes": [
      { "stat": "dmg",            "names": ["Honed", "Brutal", "Merciless", "Ravaging", "Annihilating"],           "tiers": [1, 2, 3, 4, 6],             "slots": null },
      { "stat": "maxHpBonus",     "names": ["Plated", "Reinforced", "Fortified", "Bulwarked", "Adamant"],          "tiers": [2, 4, 6, 9, 13],            "slots": null },
      { "stat": "bsBonus",        "names": ["Piercing", "Incisive", "Eviscerating", "Impaling", "Rending"],        "tiers": [1, 2, 3, 4, 6],             "slots": null },
      { "stat": "flaskHealBonus", "names": ["Self-Sealing", "Regenerative", "Undying", "Restorative", "Immortal"], "tiers": [2, 4, 6, 9, 13],            "slots": null },
      { "stat": "salvageMult",    "names": ["Scavenger's", "Harvester's", "Magnate's", "Baron's", "Tycoon's"],     "tiers": [0.15, 0.25, 0.4, 0.55, 0.75], "slots": null }
    ],
    "suffixes": [
      { "stat": "maxStBonus",     "names": ["of Capacity", "of the Dynamo", "of the Reactor", "of the Generator", "of the Singularity"], "tiers": [1, 1, 2, 2, 3],     "slots": null },
      { "stat": "rollCostDelta",  "names": ["of Thrust", "of Burn", "of Flight", "of the Comet", "of the Void"],                         "tiers": [-1, -1, -1, -2, -2], "slots": null },
      { "stat": "parryCostDelta", "names": ["of Deflection", "of the Aegis", "of the Bulwark", "of the Sentinel", "of the Absolute"],     "tiers": [-1, -1, -1, -2, -2], "slots": null },
      { "stat": "fovBonus",       "names": ["of Sight", "of the Beacon", "of the Watchtower", "of the Overseer", "of Omniscience"],       "tiers": [1, 2, 3, 4, 5],      "slots": null },
      { "stat": "siphonOnKill",   "names": ["of Leeching", "of Siphoning", "of Reclamation", "of the Vampire", "of the Harvest"],         "tiers": [1, 1, 1, 1, 1],      "slots": null }
    ],
    // corrupted-terminal downside mods (corruption also locks the item to orbs)
    "corruptMods": [
      { "stat": "maxHpBonus", "val": -3 }, { "stat": "maxStBonus", "val": -1 },
      { "stat": "rollCostDelta", "val": 1 }, { "stat": "parryCostDelta", "val": 1 }
    ],
    // affix tier weights [t1..t5] by sector depth (depth = key tier + 1);
    // tier 4 unlocks at depth 9 (T8), tier 5 at depth 13 (T12)
    "affixTierBands": [
      { "minDepth": 1,  "w": [4, 1, 0, 0, 0] },
      { "minDepth": 2,  "w": [3, 2, 0, 0, 0] },
      { "minDepth": 4,  "w": [2, 2, 1, 0, 0] },
      { "minDepth": 6,  "w": [1, 2, 2, 0, 0] },
      { "minDepth": 9,  "w": [0, 2, 3, 2, 0] },
      { "minDepth": 13, "w": [0, 1, 3, 3, 2] }
    ],
    "uniques": [
      { "name": "Overseer's Eye", "base": "optics",
        "effects": { "bsBonus": 3, "fovBonus": 2, "dmg": 1 },
        "lore": "It watched everything down here die. Now it watches for you." },
      { "name": "Vesta's Heart", "base": "regulator",
        "effects": { "flaskHealBonus": 6, "maxHpBonus": 4 },
        "lore": "The foundry's first reactor never stopped beating." },
      { "name": "Last Argument", "base": "cleaver",
        "effects": { "dmg": 3, "maxStBonus": 1 },
        "lore": "There is no counter-proposal." }
    ]
  },

  "combat": {
    "dashRange": 2,
    "fov": { "base": 7, "min": 3 },
    "rollCost": { "min": 1, "max": 4 },
    "parryCost": { "base": 2, "min": 1, "max": 3 },
    "flaskHealBase": 8,
    // shared by the Volatile key mod and a Corrupted Zone kill: the dying
    // machine detonates for this much if you're standing adjacent
    "volatileDetonationDmg": 1,
    // the root-tier special attack (Overload Slam / Rail Charge / Barrage
    // Volley) — one power cost and one damage multiplier shared by all
    // three, so tuning the special-attack economy is one number, not three.
    // dmgMult sits under 1 since it lands on multiple targets (or without
    // needing to be adjacent), rather than dominating the plain attack
    "special": { "cost": 3, "range": 4, "dmgMult": 0.85 }
  },

  "events": {
    // odds a frontier node carries an Anomaly at all, and which kind
    "density": 0.28,
    "weights": { "surge": 0.40, "vault": 0.25, "convoy": 0.20, "corrupted": 0.15 },
    "surge": { "waveCount": 4, "waveInterval": 3, "killSoulMult": 1.5 },
    // sightRange caps how far away a chest can arm the lockdown: sensor
    // gear extends what you can SEE well past what you can REACH in nine
    // cycles, so an unbounded sighting trigger made endgame sensor builds
    // weld every vault shut before the player could possibly cross to it
    "vault": { "lockdownCycles": 9, "sightRange": 7 },
    "convoy": { "totalHaulers": 3, "entryInCycles": 3 },
    "corrupted": { "radius": 3, "dmgAdd": 1 }
  },

  // Skill chips: found combat subroutines, socketed into HUD slots and
  // fired mid-fight for power — the mechanism that replaced the counted
  // dart/cell consumables. Finding a chip you already know fuses into it
  // for +1 level; each level adds the chip's perLevel numbers on top of
  // base. Names, descriptions, targeting kinds and the combat code live
  // in rl.js (identity/behavior); every NUMBER lives here. cooldown is
  // in turns after the cast; cost is power. chestChance is the slice of
  // non-elite chest rolls that pay a chip (it replaced the supply slice).
  "skills": {
    "slots": 2,
    "maxLevel": 5,
    "fuseRefundCores": 25,
    "migrateRefundPerExtra": 10,
    "chestChance": 0.14,
    "defs": {
      "shockDart":   { "cost": 1, "cooldown": 2, "base": { "range": 4, "dmg": 4 },              "perLevel": { "dmg": 2 } },
      "powerCell":   { "cost": 0, "cooldown": 8, "base": { "power": 4, "heal": 2 },             "perLevel": { "power": 1, "heal": 1 } },
      "magGrapple":  { "cost": 2, "cooldown": 4, "base": { "range": 4, "dmg": 1, "stagger": 1 },"perLevel": { "dmg": 1, "range": 1 } },
      "arcMine":     { "cost": 2, "cooldown": 4, "base": { "dmg": 5 },                          "perLevel": { "dmg": 2 } },
      "kineticWard": { "cost": 2, "cooldown": 6, "base": { "absorb": 4 },                       "perLevel": { "absorb": 2 } },
      "empBurst":    { "cost": 3, "cooldown": 6, "base": { "radius": 2, "stagger": 2, "dmg": 0 },"perLevel": { "dmg": 2 } }
    }
  }
};
