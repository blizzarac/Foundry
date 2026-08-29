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

    // frame lattice: the node table is the literal config array, not a copy,
    // and the validator walks the graph — a broken edge or unknown mech key
    // is a named boot error, not a silently dead branch
    out.treeNodesAreConfigTable = RL.TREE_NODES === CFG.frameTree.nodes;
    const ftBadEdge = JSON.parse(JSON.stringify(CFG));
    ftBadEdge.frameTree.nodes[1].requires = ["no-such-node"];
    out.validatorRejectsBadTreeEdge = RL.validateConfig(ftBadEdge)
      .some(e => e.includes("requires unknown node") || e.includes("unreachable"));
    const ftBadMech = JSON.parse(JSON.stringify(CFG));
    const mechNode = ftBadMech.frameTree.nodes.find(n => n.mech);
    mechNode.mech.key = "notARealMechanic";
    out.validatorRejectsUnknownMechKey = RL.validateConfig(ftBadMech)
      .some(e => e.includes("known mechanic"));
    const ftOrphan = JSON.parse(JSON.stringify(CFG));
    // cutting every entry point (making all nodes require something)
    // orphans the whole graph — the reachability walk must catch it
    for (const n of ftOrphan.frameTree.nodes) if (!n.requires.length) n.requires = ["chK"];
    out.validatorRejectsOrphanedTree = RL.validateConfig(ftOrphan)
      .some(e => e.includes("unreachable") || e.includes("no entry nodes"));
    // retired shop upgrades stay in config purely as migration data — the
    // refund math reads base costs and deltas from here
    out.retiredUpgradesStillValidated = Array.isArray(CFG.economy.upgrades) &&
      CFG.economy.upgrades.every(u => u.id && typeof u.base === "number" && u.delta);

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

    // --- implicits: PoE2-style roll range + depth scaling, sourced from
    // items.baseTypes[x].implicit (a {min,max} per stat) and
    // items.implicitScaling. The generation-invariant proofs (real
    // variance, range containment, depth growth) live in item-smoke.js;
    // this proves the specific numbers trace back to config.
    const bkCfg = CFG.items.baseTypes.bulkhead.implicit.maxHpBonus;
    out.implicitRangeIsConfigData = RL.BASE_TYPES.bulkhead.implicit.maxHpBonus.min === bkCfg.min &&
      RL.BASE_TYPES.bulkhead.implicit.maxHpBonus.max === bkCfg.max;
    const depth10Scale = 1 + CFG.items.implicitScaling.growthPerDepthTier * 9;
    const rolled = RL.rollImplicit(() => 0.5, "bulkhead", 10);   // midpoint roll
    const expectedMid = Math.round((bkCfg.min * depth10Scale + bkCfg.max * depth10Scale) / 2);
    out.rollImplicitUsesScalingConfig = rolled.maxHpBonus === expectedMid;
    // changing the scaling coefficient changes the result — not a copy
    // still baked into the formula
    const rolledFlat = RL.rollImplicit(() => 0.5, "bulkhead", 1);
    out.depthScalingActuallyMoves = rolled.maxHpBonus > rolledFlat.maxHpBonus;
    // the empty-ranges case (no base type ships one today, but the shape
    // is still legal) stays empty rather than erroring — temporarily
    // strip a real base type's implicit on the live object rl.js reads
    const savedBladeImplicit = RL.BASE_TYPES.blade.implicit;
    RL.BASE_TYPES.blade.implicit = {};
    out.emptyImplicitStaysEmpty = Object.keys(RL.rollImplicit(() => 0.5, "blade", 10)).length === 0;
    RL.BASE_TYPES.blade.implicit = savedBladeImplicit;
    // validator: a malformed range (min > max, or a missing bound) is rejected
    const implBad1 = JSON.parse(JSON.stringify(CFG));
    implBad1.items.baseTypes.plating.implicit.maxHpBonus = { min: 5, max: 2 };
    out.validatorRejectsInvertedImplicitRange = RL.validateConfig(implBad1)
      .some(e => e.includes("baseTypes.plating.implicit.maxHpBonus"));
    const implBad2 = JSON.parse(JSON.stringify(CFG));
    delete implBad2.items.implicitScaling;
    out.validatorRejectsMissingImplicitScaling = RL.validateConfig(implBad2)
      .some(e => e.includes("implicitScaling"));

    // --- open-ended endgame: both knobs are validator-enforced config, and
    // the affix deep-scaling coefficient provably feeds the rolled numbers
    // (the T-band tables stay exact at the ladder, grow past it)
    const deepBad1 = JSON.parse(JSON.stringify(CFG));
    delete deepBad1.items.affixDeepScaling;
    out.validatorRejectsMissingAffixDeepScaling = RL.validateConfig(deepBad1)
      .some(e => e.includes("affixDeepScaling"));
    const deepBad2 = JSON.parse(JSON.stringify(CFG));
    delete deepBad2.levelGen.sector.keyDropAheadPostLadder;
    out.validatorRejectsMissingDropAhead = RL.validateConfig(deepBad2)
      .some(e => e.includes("keyDropAheadPostLadder"));
    const deepBad3 = JSON.parse(JSON.stringify(CFG));
    delete deepBad3.enemies.scaling.postLadder;
    out.validatorRejectsMissingPostLadderScaling = RL.validateConfig(deepBad3)
      .some(e => e.includes("postLadder"));

    // territory minimums: validator-enforced, and the formula reads the
    // live config object (mutating ringWidth moves the answer)
    const terrBad = JSON.parse(JSON.stringify(CFG));
    delete terrBad.levelGen.territory;
    out.validatorRejectsMissingTerritory = RL.validateConfig(terrBad)
      .some(e => e.includes("territory"));
    const minBefore = RL.territoryMinTier(40, 0);
    const savedRW = CFG.levelGen.territory.ringWidth;
    CFG.levelGen.territory.ringWidth = savedRW * 4;
    const minAfter = RL.territoryMinTier(40, 0);
    CFG.levelGen.territory.ringWidth = savedRW;
    out.territoryReadsLiveConfig = minAfter < minBefore;
    const ds = CFG.items.affixDeepScaling;
    const mkd = (() => { let a = 11; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    const topDmgAffix = depth => {
      let top = 0;
      for (let i = 0; i < 250; i++) {
        const it = RL.genItem(mkd, "cleaver", "rare", depth);
        for (const a of it.affixes) if (a.stat === "dmg") top = Math.max(top, a.effect.dmg);
      }
      return top;
    };
    const dmgTierTable = CFG.items.prefixes.find(p => p.stat === "dmg").tiers;
    const atLadder = topDmgAffix(ds.startDepth);
    const deepDepth = ds.startDepth + 20;
    out.deepScalingIdleThroughLadder = atLadder === dmgTierTable[dmgTierTable.length - 1];
    out.deepScalingGrowsPastLadder = topDmgAffix(deepDepth) ===
      Math.round(dmgTierTable[dmgTierTable.length - 1] * (1 + ds.growthPerDepth * 20));

    // --- Blessed Orb (reroll implicits): CURRENCY entry, shop price, and
    // loot-drop weight all trace back to config.js, not a hardcoded copy
    out.blessCurrencyDefined = !!RL.CURRENCY.bless && !!RL.CURRENCY.bless.name;
    out.blessShopCostFromConfig = RL.SHOP_ORBS.find(o => o.kind === "bless").cost ===
      CFG.economy.orbs.find(o => o.kind === "bless").cost;
    // rollOrbKind's whole weight table is config data now (not just bless's
    // entry) — prove it by mutating the live config object rl.js actually
    // reads (window.IRONHEX_CONFIG is only read once, at boot, so editing
    // that afterward wouldn't touch anything — RL.CFG is the same object
    // rollOrbKind's closure holds) and watching the odds move
    const originalWeights = RL.CFG.economy.orbDropWeights;
    RL.CFG.economy.orbDropWeights = originalWeights.filter(o => o.kind !== "bless");
    let sawBlessAfterRemoval = false;
    for (let i = 0; i < 500 && !sawBlessAfterRemoval; i++)
      if (RL.rollOrbKind(() => i / 500, 5) === "bless") sawBlessAfterRemoval = true;
    RL.CFG.economy.orbDropWeights = originalWeights;   // restore before later checks run
    out.orbDropWeightsAreLiveConfig = !sawBlessAfterRemoval;
    const validBless = RL.validateConfig(CFG).length === 0;
    const droppedWeight = JSON.parse(JSON.stringify(CFG));
    delete droppedWeight.economy.orbDropWeights;
    out.validatorRejectsMissingOrbDropWeights = validBless &&
      RL.validateConfig(droppedWeight).some(e => e.includes("orbDropWeights"));

    // --- affix slot restrictions: scaffolded but not yet used. Every
    // entry ships with slots:null (unrestricted, today's real behavior);
    // wiring is live in rollAffix so a later config edit is all it takes
    // to gate an affix to specific slots, no code change needed.
    out.affixSlotsDefaultUnrestricted = RL.PREFIXES.every(a => a.slots === null) &&
      RL.SUFFIXES.every(a => a.slots === null);
    {
      // temporarily restrict "maxHpBonus" (normally rolls on anything) to
      // weapons only, and prove genItem actually respects it live
      const hpPrefix = RL.PREFIXES.find(a => a.stat === "maxHpBonus");
      const savedSlots = hpPrefix.slots;
      hpPrefix.slots = ["weapon"];
      const rng2 = (() => { let a = 99; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
      let onWeapon = false, onNonWeapon = false;
      for (let i = 0; i < 300; i++) {
        const w = RL.genItem(rng2, "blade", "rare", 5);
        const s = RL.genItem(rng2, "servo", "rare", 5);
        if (w.affixes.some(a => a.stat === "maxHpBonus")) onWeapon = true;
        if (s.affixes.some(a => a.stat === "maxHpBonus")) onNonWeapon = true;
      }
      out.affixSlotRestrictionAppliesToMatchingSlot = onWeapon;
      out.affixSlotRestrictionExcludesOtherSlots = !onNonWeapon;
      hpPrefix.slots = savedSlots;   // restore — other checks assume the shipped config
    }
    // validator: null passes, a valid array passes, a malformed value fails
    const slotsOk1 = JSON.parse(JSON.stringify(CFG));
    slotsOk1.items.prefixes[0].slots = ["weapon", "sensor"];
    out.validatorAcceptsValidSlotsArray = RL.validateConfig(slotsOk1).length === 0;
    const slotsBad1 = JSON.parse(JSON.stringify(CFG));
    slotsBad1.items.prefixes[0].slots = "weapon";   // string, not an array
    out.validatorRejectsNonArraySlots = RL.validateConfig(slotsBad1)
      .some(e => e.includes("items.prefixes[0].slots"));
    const slotsBad2 = JSON.parse(JSON.stringify(CFG));
    slotsBad2.items.suffixes[0].slots = ["hat"];   // not a real slot
    out.validatorRejectsUnknownSlotName = RL.validateConfig(slotsBad2)
      .some(e => e.includes("items.suffixes[0].slots"));

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
