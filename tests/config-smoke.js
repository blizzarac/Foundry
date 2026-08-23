/* Config-extraction acceptance suite: proves config.js is the real source
   of the numbers it claims to hold — not just coincidentally matching
   values still hardcoded in rl.js — and that a broken config is caught
   loudly rather than producing silent NaN damage. Runs the real game
   headless.

   Usage:  npm install playwright-core && node tests/config-smoke.js
   Set CHROMIUM_PATH if Playwright can't find a browser on its own. */
const path = require("path");
const { chromium } = require("playwright-core");

let fails = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name);
  if (!cond) fails++;
}

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(400);

  const r = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};
    const CFG = RL.CFG;

    out.configLoadedCleanly = RL.CFG_ERRORS.length === 0;
    out.configHasSections = !!(CFG.enemies && CFG.campaign && CFG.levelGen && CFG.economy);

    // enemy base stats: ENEMY merges config numbers onto code identity
    out.enemyStatsFromConfig = RL.ENEMY.scrapper.hp === CFG.enemies.base.scrapper.hp &&
      RL.ENEMY.scrapper.dmg === CFG.enemies.base.scrapper.dmg &&
      RL.ENEMY.sentinel.souls === CFG.enemies.base.sentinel.souls &&
      RL.ENEMY.scrapper.name === "Scrapper";   // identity still comes from code

    // enemy tier-scaling formula reads its coefficients from config, not
    // from a copy baked into the formula
    RL.startRun(777);
    const run1 = RL.run, p1 = run1.player;
    run1.mode = "sector";
    // R must stay a real number: the background render loop sizes its
    // terrain cache off floorConf.R every frame, even mid-test
    run1.floorConf = { tier: 6, hpMult: 1, dmgAdd: 0, R: run1.floorConf.R };
    const e = RL.spawnEnemy("scrapper", p1.q, p1.r);
    const sc = CFG.enemies.scaling;
    const expectHp = Math.round(CFG.enemies.base.scrapper.hp * (1 + sc.hpGrowthPerTier * (6 - 1)));
    const expectDmg = CFG.enemies.base.scrapper.dmg + (6 >= sc.dmgFreeTiers ? 1 + Math.floor((6 - sc.dmgFreeTiers) / sc.dmgStepEveryNTiers) : 0);
    out.enemyScalingUsesConfig = e.maxHp === expectHp && e.dmg === expectDmg;

    // elite promotion multiplier
    const e2 = RL.spawnEnemy("scrapper", p1.q + 1, p1.r);
    const hpBefore = e2.maxHp;
    e2.elite = true;
    const promo = sc.elitePromotion;
    e2.hp = e2.maxHp = Math.round(e2.maxHp * promo.hpMult);
    out.elitePromotionShapeMatchesConfig = typeof promo.hpMult === "number" && typeof promo.dmgAdd === "number" &&
      e2.maxHp === Math.round(hpBefore * promo.hpMult);

    // shop upgrades: base/cap come from config, not a hardcoded array
    const hpU = RL.UPGRADES.find(u => u.id === "hp");
    const hpCfg = CFG.economy.upgrades.find(u => u.id === "hp");
    out.upgradesFromConfig = hpU.base === hpCfg.base && hpU.cap === hpCfg.cap;
    // and the generic apply() combinator actually applies the configured delta
    const before = { baseMaxHp: p1.baseMaxHp, hp: p1.hp };
    hpU.apply(p1);
    out.upgradeApplyUsesDelta = p1.baseMaxHp === before.baseMaxHp + hpCfg.delta.baseMaxHp &&
      p1.hp === before.hp + hpCfg.delta.hp;

    // key fabrication cost formula
    out.keyFabCostUsesConfig = RL.keyFabCost(5) ===
      Math.round(CFG.economy.keyFab.base * Math.pow(5, CFG.economy.keyFab.exponent));

    // salvage formulas
    const svCfg = CFG.economy.salvage;
    out.sellValueUsesConfig = RL.sellValue({ rarity: "rare", affixes: [{ kind: "prefix", tier: 3 }], corrupted: false }) ===
      svCfg.rarityFloor.rare + 3 * svCfg.perAffixTier;
    const fakeKey = { tier: 4, affixes: [{}, {}] };
    const fab4 = RL.keyFabCost(4);
    out.keySalvageUsesConfig = RL.keySalvageValue(fakeKey) ===
      Math.round(fab4 * svCfg.keyBaseFrac) + Math.round(fab4 * svCfg.keyPerModFrac) * 2;

    // tier cap / starting cap
    out.tierCapFromConfig = RL.TIER_CAP === CFG.levelGen.tierCap;

    // key mods: full table (name/desc/quant/magnitudes) comes from config,
    // and the generic apply() combinator produces the configured effect
    out.keyModTableMatchesConfig = RL.KEY_MODS.length === CFG.levelGen.keyMods.length &&
      RL.KEY_MODS.every((m, i) => m.key === CFG.levelGen.keyMods[i].key && m.quant === CFG.levelGen.keyMods[i].quant);
    const swarmingCfg = CFG.levelGen.keyMods.find(m => m.key === "swarming");
    const modState = { spawnMult: 1, hpMult: 1, dmgAdd: 0, extraElites: 0, fovPenalty: 0, flaskPenalty: 0, volatile: false };
    RL.KEY_MODS.find(m => m.key === "swarming").apply(modState);
    out.keyModApplyUsesConfigMagnitude = modState.spawnMult === swarmingCfg.spawnMult;

    // --- items (phase 2): rarity caps, base-type numbers, and the fully
    // data-shaped tables (prefixes/suffixes/corrupt mods/tier bands/
    // uniques/key mod caps) all trace back to config.js
    out.rarityCapsFromConfig = RL.RARITY.rare.maxPrefix === CFG.items.rarityCaps.rare.maxPrefix &&
      RL.RARITY.rare.maxSuffix === CFG.items.rarityCaps.rare.maxSuffix &&
      RL.RARITY.rare.name === "Rare";   // identity still comes from code
    out.baseTypeStatsFromConfig = RL.BASE_TYPES.cleaver.dmg === CFG.items.baseTypes.cleaver.dmg &&
      RL.BASE_TYPES.cleaver.rollCost === CFG.items.baseTypes.cleaver.rollCost &&
      RL.BASE_TYPES.cleaver.cleave === true &&              // behavior flag still comes from code
      RL.BASE_TYPES.cleaver.name === "Plasma Cleaver";
    out.bareFistsFromConfig = RL.BARE_FISTS.dmg === CFG.items.bareFists.dmg;
    // these three are built as direct references to the config arrays —
    // strict equality proves rl.js reads the table, not a copy of it
    out.prefixesAreConfigTable = RL.PREFIXES === CFG.items.prefixes;
    out.suffixesAreConfigTable = RL.SUFFIXES === CFG.items.suffixes;
    out.corruptModsAreConfigTable = RL.CORRUPT_MODS === CFG.items.corruptMods;
    out.affixTierBandsAreConfigTable = RL.AFFIX_TIER_BANDS === CFG.items.affixTierBands;
    out.uniquesAreConfigTable = RL.UNIQUES === CFG.items.uniques;
    out.keyModCapFromConfig = RL.KEY_MOD_CAP.rare === CFG.items.keyModCap.rare;

    // --- combat (phase 3)
    out.dashRangeFromConfig = RL.DASH_RANGE === CFG.combat.dashRange;
    out.fovBaseFromConfig = RL.FOV_R === CFG.combat.fov.base;
    out.flaskHealFromConfig = RL.FLASK_HEAL === CFG.combat.flaskHealBase;
    // fov floor: a huge penalty must still clamp at combat.fov.min, not go negative
    RL.startRun(555);
    RL.run.mode = "sector";
    RL.run.floorConf = { R: RL.run.floorConf.R, fovPenalty: 999 };
    out.fovMinClampFromConfig = RL.playerFovR() === CFG.combat.fov.min;
    // rollCost/parryCost clamp bounds
    RL.startRun(556);
    const p3 = RL.run.player;
    RL.recalc();
    out.rollCostWithinConfigBounds = p3.rollCost >= CFG.combat.rollCost.min && p3.rollCost <= CFG.combat.rollCost.max;
    out.parryCostWithinConfigBounds = p3.parryCost >= CFG.combat.parryCost.min && p3.parryCost <= CFG.combat.parryCost.max &&
      p3.parryCost === CFG.combat.parryCost.base;   // no gear equipped yet: base value exactly

    // --- events (phase 3)
    out.eventDensityFromConfig = RL.EVENT_DENSITY === CFG.events.density;
    out.eventWeightsFromConfig = RL.NODE_EVENTS.every((k, i) => RL.EVENT_WEIGHTS[i] === CFG.events.weights[k]);
    out.surgeWaveConfigFromConfig = RL.WAVE_COUNT === CFG.events.surge.waveCount &&
      RL.WAVE_INTERVAL === CFG.events.surge.waveInterval;
    out.vaultLockdownFromConfig = RL.VAULT_LOCKDOWN_CYCLES === CFG.events.vault.lockdownCycles;

    // the validator itself: an empty config must fail with real errors,
    // and a deliberately broken one must name the specific missing field —
    // spot-check one field from each of the three new sections too
    const emptyErrors = RL.validateConfig({});
    out.validatorRejectsEmptyConfig = emptyErrors.length > 0;
    const partial = JSON.parse(JSON.stringify(CFG));
    delete partial.economy.gambleCost;
    delete partial.items.uniques;
    delete partial.combat.dashRange;
    delete partial.events.vault;
    const partialErrors = RL.validateConfig(partial);
    out.validatorNamesMissingField = partialErrors.some(e => e.includes("gambleCost"));
    out.validatorCatchesMissingItemsField = partialErrors.some(e => e.includes("items.uniques"));
    out.validatorCatchesMissingCombatField = partialErrors.some(e => e.includes("combat.dashRange"));
    out.validatorCatchesMissingEventsField = partialErrors.some(e => e.includes("events.vault"));
    out.validatorAcceptsRealConfig = RL.validateConfig(CFG).length === 0;

    return out;
  });
  for (const [k, v] of Object.entries(r)) check(k, !!v);

  // sector-gen coefficients: enter a real keyed sector and check the
  // computed floor config against config.js by hand
  const r2 = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};
    RL.startRun(9001);
    RL.winRun();
    RL.enterOverworld();
    RL.run.player.souls = 99999;
    RL.profile.atlas.tierCap = 8;   // past the starting cap so a T6 key can fabricate
    RL.fabricateKey(6);
    const k6 = RL.profile.atlas.keys.find(kk => kk.tier === 6);
    const nk = Object.keys(RL.profile.atlas.nodes).find(kk => RL.profile.atlas.nodes[kk].state === "frontier");
    const [q, r] = nk.split(",").map(Number);
    const biomeKey = RL.profile.atlas.nodes[nk].biome;
    RL.enterNode(q, r, k6.id);
    const f = RL.run.floorConf;
    const sg = RL.CFG.levelGen.sector;
    out.sectorRMatchesConfig = f.R === sg.baseR + (6 >= sg.bigRAtTier ? 1 : 0);
    out.eliteCountMatchesConfig = f.eliteCount === 1 + sg.eliteBumpTiers.filter(t => 6 >= t).length;
    // plain T6 key, no mods: quant is 0, so chests = biome base + tier bonus only
    const biomeChests = RL.BIOMES[biomeKey].chests || 1;
    out.chestsMatchConfig = f.chests === biomeChests + (6 >= sg.chestBonusAtTier ? 1 : 0);
    try { localStorage.removeItem("ironhex-foundry"); } catch (e) {}
    return out;
  });
  for (const [k, v] of Object.entries(r2)) check(k, !!v);

  check("noPageErrors", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 5));
  await browser.close();
  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
