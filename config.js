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
      "hauler":   { "hp": 3,  "dmg": 0, "souls": 6 }
    },
    "scaling": {
      // keyed-sector hp: base.hp * (1 + hpGrowthPerTier * (tier - 1))
      "hpGrowthPerTier": 0.35,
      // keyed-sector dmg: base.dmg + 1 + floor((tier - dmgFreeTiers) / dmgStepEveryNTiers), from tier dmgFreeTiers on
      "dmgFreeTiers": 3,
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
    "sector": {
      "baseR": 8,
      "bigRAtTier": 3,
      "gateArenaR": 9,
      // pack density: spawnCount *= 1 + packGrowthPct * floor(tier / packGrowthEveryNTiers)
      "packGrowthEveryNTiers": 3,
      "packGrowthPct": 0.05,
      // sectors at these tiers (and beyond) each add one more Prime unit
      "eliteBumpTiers": [3, 7, 11],
      "chestBonusAtTier": 3,
      "chestPerLootBonus": 0.25,
      "terminalChance": 0.4,
      // sectorComplete(): odds a second key drops, weighted by Primes killed
      // and the key's own loot bonus; odds a dropped key is one tier deeper
      "keyDropSecondChanceEliteWeight": 0.3,
      "keyDropBumpTierChance": 0.35,
      "keyDropMagicChanceAtTier2Plus": 0.2
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
    // shop upgrade ranks: cost = round(base * 2^ranksBought); delta adds
    // flat amounts to the named player fields on purchase
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
      { "kind": "chaos",     "cost": 250 },
      { "kind": "exalt",     "cost": 400 }
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
    // behavior flags read by the attack code) stay in rl.js as identity
    "baseTypes": {
      "blade":     { "implicit": {}, "dmg": 2, "atkCost": 1, "rollCost": 2, "bsBonus": 2 },
      "shiv":      { "implicit": {}, "dmg": 1, "atkCost": 1, "rollCost": 1, "bsBonus": 4 },
      "cleaver":   { "implicit": {}, "dmg": 4, "atkCost": 2, "rollCost": 2, "bsBonus": 2 },
      "lance":     { "implicit": {}, "dmg": 2, "atkCost": 1, "rollCost": 2, "bsBonus": 2 },
      "plating":   { "implicit": { "maxHpBonus": 3 } },
      "bulkhead":  { "implicit": { "maxHpBonus": 5, "rollCostDelta": 1 } },
      "optics":    { "implicit": { "bsBonus": 2 } },
      "array":     { "implicit": { "fovBonus": 1 } },
      "servo":     { "implicit": { "rollCostDelta": -1 } },
      "regulator": { "implicit": { "flaskHealBonus": 3 } },
      "capacitor": { "implicit": { "maxStBonus": 1 } },
      "recycler":  { "implicit": { "salvageMult": 0.3333333333333333 } },
      "reclaimer": { "implicit": { "siphonOnKill": 1 } },
      "dampener":  { "implicit": { "parryCostDelta": -1 } }
    },
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
    "volatileDetonationDmg": 1
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
