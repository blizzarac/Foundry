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
      "elitePromotion": { "hpMult": 1.5, "dmgAdd": 1 }
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
    "restocks": [
      { "kind": "dart", "name": "Shock Dart", "desc": "+1 shock dart", "cost": 40 },
      { "kind": "cell", "name": "Power Cell", "desc": "+1 power cell", "cost": 60 }
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
      { "id": "syc3", "branch": "systems", "kind": "notable", "name": "Motherlode",          "requires": ["syc1", "syc2"], "effect": { "salvageMult": 0.25, "maxStBonus": 1 } }
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
    "vault": { "lockdownCycles": 9 },
    "convoy": { "totalHaulers": 3, "entryInCycles": 3 },
    "corrupted": { "radius": 3, "dmgAdd": 1 }
  }
};
