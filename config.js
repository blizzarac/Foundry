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
  }
};
