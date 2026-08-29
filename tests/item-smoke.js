/* Item-system acceptance suite for Ironhex's ARPG loot (rarities, affixes,
   currency orbs, equip/unequip, drops). Runs the real game headless.

   Usage:  npm install playwright-core && node tests/item-smoke.js
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
    RL.startRun(12345);
    const run = RL.run;
    const p = run.player;

    out.starterEquipped = p.equip.weapon !== null && RL.itemById(p.equip.weapon).base === "blade";
    out.starterNormal = RL.itemById(p.equip.weapon).rarity === "normal";
    out.startCurrency = p.currency.transmute === 2 && p.currency.alch === 1;

    // deterministic local rng for generation invariants
    const mk = (() => { let a = 42; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    let magicOk = true, rareOk = true, statDup = false;
    for (let i = 0; i < 200; i++) {
      const m = RL.genItem(mk, "plating", "magic", 3);
      if (m.affixes.filter(a => a.kind === "prefix").length > 1 ||
          m.affixes.filter(a => a.kind === "suffix").length > 1 || m.affixes.length < 1) magicOk = false;
      const rr = RL.genItem(mk, "blade", "rare", 5);
      if (rr.affixes.filter(a => a.kind === "prefix").length > 2 ||
          rr.affixes.filter(a => a.kind === "suffix").length > 2 || rr.affixes.length < 3) rareOk = false;
      const stats = rr.affixes.map(a => a.stat);
      if (new Set(stats).size !== stats.length) statDup = true;
    }
    out.magicCaps = magicOk;
    out.rareCaps = rareOk;
    out.noDupStats = !statDup;

    // implicits roll within a per-item range (PoE2-style) and widen with
    // sector depth — not the flat, identical-every-time value they used
    // to be. Sample a base type with a wide range (bulkhead) at shallow
    // and deep depth to check range containment, real variance, and that
    // depth actually shifts the roll upward on average.
    const bkRange = RL.CFG.items.baseTypes.bulkhead.implicit.maxHpBonus;
    const scaleAt = d => 1 + RL.CFG.items.implicitScaling.growthPerDepthTier * (d - 1);
    let shallowRolls = [], deepRolls = [];
    let allWithinRange = true;
    for (let i = 0; i < 150; i++) {
      const s = RL.genItem(mk, "bulkhead", "normal", 1);
      const dScale = scaleAt(1);
      if (s.implicit.maxHpBonus < Math.round(bkRange.min * dScale) - 1 ||
          s.implicit.maxHpBonus > Math.round(bkRange.max * dScale) + 1) allWithinRange = false;
      shallowRolls.push(s.implicit.maxHpBonus);
      const d = RL.genItem(mk, "bulkhead", "normal", 14);
      deepRolls.push(d.implicit.maxHpBonus);
    }
    out.implicitRangeHonored = allWithinRange;
    out.implicitHasRealVariance = new Set(shallowRolls).size > 1;
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    out.implicitScalesUpWithDepth = avg(deepRolls) > avg(shallowRolls);

    // an item saved before implicits rolled per-item (no .implicit field)
    // falls back to the range midpoint rather than losing the stat
    const legacyItem = { base: "plating", rarity: "normal", affixes: [] };
    const legacyEffect = RL.itemEffect(legacyItem);
    const plRange = RL.CFG.items.baseTypes.plating.implicit.maxHpBonus;
    out.legacyItemFallsBackToMidpoint = legacyEffect.maxHpBonus === Math.round((plRange.min + plRange.max) / 2);

    const u = RL.genUnique(mk, 3);
    out.unique = u.rarity === "unique" && !!u.lore && u.affixes.length === 1;
    out.uniqueHasImplicitField = typeof u.implicit === "object" && u.implicit !== null;
    // uniques carry the base type's implicit too, same as any other item —
    // force-pick UNIQUES[0] (Overseer's Eye, base "optics", which has a
    // real implicit range) via a zero rng to check a non-empty case
    const zeroRng = () => 0;
    const u0 = RL.genUnique(zeroRng, 3);
    out.uniqueCarriesBaseImplicit = u0.base === "optics" && Object.keys(u0.implicit).length > 0;

    const arm = RL.genArmoryItem(mk);
    out.armoryIsRareWeapon = arm.rarity === "rare" && RL.BASE_TYPES[arm.base].slot === "weapon";

    const cor = RL.genCorruptedItem(mk, 3);
    out.corruptedHasDownside = cor.corrupted && cor.affixes.some(a => a.kind === "corrupt");
    out.corruptRejectsOrbs = !RL.canApplyOrb("exalt", cor).ok && !RL.canApplyOrb("chaos", cor).ok;

    // equip flow: implicit applies and reverts. The implicit now rolls
    // within a per-item range (config: items.baseTypes.plating.implicit),
    // so check it landed within that range rather than an exact literal.
    const plate = RL.genItem(mk, "plating", "normal", 1);
    const platingRange = RL.CFG.items.baseTypes.plating.implicit.maxHpBonus;
    out.implicitWithinConfigRange = plate.implicit.maxHpBonus >= platingRange.min &&
      plate.implicit.maxHpBonus <= platingRange.max;
    p.items.push(plate);
    const hpBefore = p.maxHp;
    RL.equipItem(plate.id);
    out.implicitApplies = p.maxHp === hpBefore + plate.implicit.maxHpBonus;
    RL.unequipItem("plating");
    out.unequipReverts = p.maxHp === hpBefore;
    RL.equipItem(plate.id);

    // craft chain: transmute -> aug -> regal -> exalt -> chaos
    out.transmute = RL.applyOrb("transmute", plate.id) && plate.rarity === "magic" && plate.affixes.length === 1;
    RL.applyOrb("aug", plate.id);
    out.augCapped = plate.affixes.length <= 2;
    p.currency.regal = 1; p.currency.exalt = 2; p.currency.chaos = 1;
    out.regal = RL.applyOrb("regal", plate.id) && plate.rarity === "rare";
    const nBefore = plate.affixes.length;
    out.exalt = RL.applyOrb("exalt", plate.id) ? plate.affixes.length === nBefore + 1 : nBefore === 4;
    const nowN = plate.affixes.length;
    out.chaosKeepsCount = RL.applyOrb("chaos", plate.id) && plate.affixes.length === nowN;
    out.wrongOrbRefused = !RL.applyOrb("transmute", plate.id);

    // Blessed Orb: rerolls the implicit only — affixes and rarity are
    // untouched, and unlike the other orbs it works on any rarity
    // (including Uniques), gated only by whether the base carries an
    // implicit at all
    const plateRange = RL.CFG.items.baseTypes.plating.implicit.maxHpBonus;
    const depthScale = 1 + RL.CFG.items.implicitScaling.growthPerDepthTier * ((run.floor || 1) - 1);
    const affixesBeforeBless = plate.affixes.length, rarityBeforeBless = plate.rarity;
    p.currency.bless = 1;
    out.blessRerollsImplicit = RL.applyOrb("bless", plate.id) &&
      plate.affixes.length === affixesBeforeBless && plate.rarity === rarityBeforeBless &&
      plate.implicit.maxHpBonus >= Math.round(plateRange.min * depthScale) - 1 &&
      plate.implicit.maxHpBonus <= Math.round(plateRange.max * depthScale) + 1;
    out.blessConsumesCurrency = (p.currency.bless || 0) === 0;
    out.blessRefusedWithoutCurrency = !RL.applyOrb("bless", plate.id);
    p.currency.bless = 1;
    // every weapon base type now carries its own implicit (blade -> dmg,
    // shiv -> bsBonus, cleaver -> maxStBonus, lance -> fovBonus), so bless
    // works on the equipped starter weapon same as any other slot
    const weaponItem = RL.itemById(p.equip.weapon);
    const weaponStat = Object.keys(RL.CFG.items.baseTypes[weaponItem.base].implicit)[0];
    const weaponRange = RL.CFG.items.baseTypes[weaponItem.base].implicit[weaponStat];
    const weaponDepthScale = 1 + RL.CFG.items.implicitScaling.growthPerDepthTier * ((run.floor || 1) - 1);
    out.blessAcceptsWeapon = RL.canApplyOrb("bless", weaponItem).ok && RL.applyOrb("bless", weaponItem.id) &&
      weaponItem.implicit[weaponStat] >= Math.round(weaponRange.min * weaponDepthScale) - 1 &&
      weaponItem.implicit[weaponStat] <= Math.round(weaponRange.max * weaponDepthScale) + 1;
    // force UNIQUES[0] (Overseer's Eye, base "optics") via a zero rng so
    // the picked unique is deterministic rather than whichever one a real
    // roll happens to land on
    const blessedUnique = RL.genUnique(() => 0, 3);
    out.blessAcceptsUnique = blessedUnique.base === "optics" && RL.canApplyOrb("bless", blessedUnique).ok;
    const corruptedForBless = RL.genCorruptedItem(mk, 3);
    out.blessRejectsCorrupted = !RL.canApplyOrb("bless", corruptedForBless).ok;
    out.orbChoicesOffersBlessOnUnique = RL.orbChoices(blessedUnique).includes("bless");
    out.orbChoicesOffersBlessOnWeapon = RL.orbChoices(weaponItem).includes("bless");
    out.blessInShop = RL.SHOP_ORBS.some(o => o.kind === "bless" && o.cost > 0);
    let sawBless = false;
    for (let i = 0; i < 400 && !sawBless; i++) if (RL.rollOrbKind(mk, 5) === "bless") sawBless = true;
    out.blessDropsFromLoot = sawBless;

    // recalc totals must match the sum of equipped items' effects
    const totals = {};
    for (const k of RL.STAT_KEYS) totals[k] = 0;
    for (const s of RL.SLOTS) {
      const it = RL.equippedItem(s);
      if (!it) continue;
      const eff = RL.itemEffect(it);
      for (const k of RL.STAT_KEYS) totals[k] += eff[k];
    }
    out.recalcHp = p.maxHp === Math.max(1, p.baseMaxHp + totals.maxHpBonus);
    out.recalcDmg = p.dmg === RL.getActiveWeaponType().dmg + p.bonusDmg + totals.dmg;

    out.noDropEquipped = !RL.dropItem(plate.id);
    const spare = RL.genItem(mk, "servo", "normal", 1);
    p.items.push(spare);
    out.drop = RL.dropItem(spare.id) && !RL.itemById(spare.id);

    // salvage: rarity floors scale, affix tiers add value, corrupted halves
    const vNorm = RL.sellValue(RL.genItem(mk, "servo", "normal", 1));
    const vMagic = RL.sellValue(RL.genItem(mk, "servo", "magic", 3));
    const vRare = RL.sellValue(RL.genItem(mk, "servo", "rare", 5));
    const vUniq = RL.sellValue(RL.genUnique(mk));
    out.sellRarityScales = vNorm < vMagic && vMagic < vRare && vRare < vUniq;
    const halfProbe = RL.genItem(mk, "optics", "rare", 5);
    const vFull = RL.sellValue(halfProbe);
    halfProbe.corrupted = true;
    out.sellCorruptedHalf = RL.sellValue(halfProbe) === Math.ceil(vFull / 2);
    out.noSellEquipped = !RL.sellItem(plate.id);
    const scrap = RL.genItem(mk, "servo", "magic", 3);
    p.items.push(scrap);
    const scrapVal = RL.sellValue(scrap);
    const soulsBefore = p.souls;
    out.sellPaysCores = RL.sellItem(scrap.id) && !RL.itemById(scrap.id) &&
      p.souls === soulsBefore + scrapVal;

    // repair bay restocks consumables — repeatable, never MAXes out
    p.souls = 500;
    const dartsBefore = p.consumables.dart || 0;
    RL.showShop();
    // the overlay sits above the topbar's souls counter, so the shop
    // repeats it — and starts with no stale purchase feedback showing
    out.shopShowsSouls = document.getElementById("shop-souls").textContent === "500";
    out.shopFeedbackHiddenOnOpen =
      document.getElementById("shop-feedback").classList.contains("hidden");
    const shopBtns = [...document.querySelectorAll("#shop-items .shop-item")];
    const dartBtn = shopBtns.find(b => b.textContent.includes("Shock Dart"));
    const cellBtn = shopBtns.find(b => b.textContent.includes("Power Cell"));
    out.shopSellsTools = !!dartBtn && !!cellBtn && !dartBtn.disabled && !cellBtn.disabled;
    const dartCost = RL.SHOP_RESTOCKS.find(s => s.kind === "dart").cost;
    if (dartBtn) dartBtn.click();
    out.shopRestockWorks = (p.consumables.dart || 0) === dartsBefore + 1 &&
      p.souls === 500 - dartCost;
    // buying updates the souls readout and flashes a feedback message —
    // both were invisible before, hidden behind the overlay or missing
    out.shopSoulsUpdateOnBuy =
      document.getElementById("shop-souls").textContent === String(500 - dartCost);
    const fb = document.getElementById("shop-feedback");
    out.shopFeedbackShownOnBuy = !fb.classList.contains("hidden") &&
      fb.textContent.includes("Shock Dart") && fb.textContent.includes(String(dartCost));
    const again = [...document.querySelectorAll("#shop-items .shop-item")]
      .find(b => b.textContent.includes("Shock Dart"));
    out.shopRestockRepeats = !!again && !again.disabled;

    // orbs for sale: cores convert into crafting currency
    p.souls = 1000;
    RL.showShop();
    const findBtn = t => [...document.querySelectorAll("#shop-items .shop-item")]
      .find(b => b.textContent.includes(t));
    const trBefore = p.currency.transmute || 0;
    findBtn("Transmutation").click();
    out.shopSellsOrbs = (p.currency.transmute || 0) === trBefore + 1 &&
      p.souls === 1000 - RL.SHOP_ORBS.find(o => o.kind === "transmute").cost;

    // prototype gamble: a blind-rolled Rare in the chosen slot, souls deducted
    p.souls = 1000;
    RL.showShop();
    // buying while scrolled deep into the list (the prototype section is
    // the last one) must not snap the shop back to the top — the feedback
    // flash used to force a reflow while the list was momentarily empty
    // and the browser would clamp scrollTop to 0 right then
    const scrollEl = document.querySelector("#shop .box");
    scrollEl.scrollTop = scrollEl.scrollHeight;
    const scrollBefore = scrollEl.scrollTop;
    const nItems = p.items.length;
    findBtn("Prototype weapon").click();
    out.buyKeepsScrollPosition = scrollBefore > 200 &&
      document.querySelector("#shop .box").scrollTop > scrollBefore - 100;
    const proto = p.items[p.items.length - 1];
    out.shopGamble = p.items.length === nItems + 1 && proto.rarity === "rare" &&
      RL.BASE_TYPES[proto.base].slot === "weapon" &&
      p.souls === 1000 - RL.GAMBLE_COST;
    out.shopHasSections = document.querySelectorAll("#shop-items .shop-head").length === 4;
    document.getElementById("shop").classList.add("hidden");
    RL.dropItem(proto.id);

    const counts = { normal: 0, magic: 0, rare: 0, unique: 0 };
    for (let i = 0; i < 2000; i++) counts[RL.rollRarity(mk, 3, false)]++;
    out.rarityOrder = counts.normal > counts.rare && counts.magic > counts.rare && counts.rare > counts.unique;

    let lootOk = true;
    for (let i = 0; i < 300; i++) {
      const it = RL.rollItemLoot(mk, 4, i % 3 === 0);
      if (!RL.BASE_TYPES[it.base] || !RL.RARITY[it.rarity] || !it.name) lootOk = false;
    }
    out.lootValid = lootOk;

    RL.unequipItem("weapon");
    // recompute totals fresh post-unequip — the weapon now carries a real
    // implicit (blade rolls dmg), so the pre-unequip `totals` above would
    // overcount by that amount now that the slot is empty
    const totalsBareFists = {};
    for (const k of RL.STAT_KEYS) totalsBareFists[k] = 0;
    for (const s of RL.SLOTS) {
      const it = RL.equippedItem(s);
      if (!it) continue;
      const eff = RL.itemEffect(it);
      for (const k of RL.STAT_KEYS) totalsBareFists[k] += eff[k];
    }
    out.bareFistsFallback = RL.getActiveWeaponType().name === "Bare Fists" &&
      p.dmg === 1 + p.bonusDmg + totalsBareFists.dmg;

    // elite kill drops gear plus two orbs
    RL.startRun(99);
    const run2 = RL.run, p2 = run2.player;
    const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    let e = null;
    for (const [dq, dr] of DIRS) {
      const t = run2.tiles.get((p2.q + dq) + "," + (p2.r + dr));
      if (t && !t.rock) { e = RL.spawnEnemy("crusher", p2.q + dq, p2.r + dr); break; }
    }
    e.elite = true; e.hp = 1; e.awake = true;
    p2.st = 5;
    const orbsBefore = Object.values(p2.currency).reduce((a, b) => a + b, 0);
    RL.actAttack(e);
    out.eliteDropsItem = run2.groundLoot.length === 1 && !!run2.groundLoot[0].item.name;
    out.eliteDropsOrbs = Object.values(p2.currency).reduce((a, b) => a + b, 0) === orbsBefore + 2;

    // boss floor always stocks the armory
    for (let f = 1; f < 5; f++) RL.descend();
    out.bossArmoryStocked = run2.chests.some(c => c.contents.kind === "item");
    // the prologue keeps its bay, including before the OVERSEER — only
    // Foundry maps lost theirs
    out.prologueKeepsBay = run2.bay !== null && typeof run2.bay.q === "number";

    // seed the backpack for the UI checks below
    window.__sellNormal = RL.genItem(mk, "servo", "normal", 1);
    window.__sellRare = RL.genItem(mk, "cleaver", "rare", 5);
    // built directly (not rolled) so it's guaranteed to carry an
    // implicit plus two of each affix kind, deliberately interleaved in
    // array order (suffix, prefix, suffix, prefix) to prove display
    // grouping actually reorders them rather than coincidentally matching
    window.__modsTestItem = {
      id: 999001, base: "bulkhead", rarity: "rare", name: "Test Directive",
      implicit: { maxHpBonus: 5, rollCostDelta: 1 },
      affixes: [
        { id: 999003, kind: "suffix", stat: "fovBonus", tier: 1, label: "of Sight", effect: { fovBonus: 1 } },
        { id: 999002, kind: "prefix", stat: "dmg", tier: 1, label: "Honed", effect: { dmg: 1 } },
        { id: 999005, kind: "suffix", stat: "maxStBonus", tier: 1, label: "of Capacity", effect: { maxStBonus: 1 } },
        { id: 999004, kind: "prefix", stat: "bsBonus", tier: 1, label: "Piercing", effect: { bsBonus: 1 } },
      ],
      corrupted: false, lore: null,
    };
    p2.items.push(window.__sellNormal, window.__sellRare, window.__modsTestItem);
    return out;
  });
  for (const [k, v] of Object.entries(r)) check(k, !!v);

  // UI: gear panel opens tabbed — Equipped active by default with five
  // slot cards, tabs switch by click and by number key, Escape closes
  await page.keyboard.press("b");
  await page.waitForTimeout(150);
  check("gearPanelOpens", await page.evaluate(() => !document.getElementById("inv").classList.contains("hidden")));
  check("equipTabDefault", await page.evaluate(() =>
    !document.getElementById("tab-equip").classList.contains("hidden") &&
    document.getElementById("tab-pack").classList.contains("hidden")));
  check("fiveSlotCards", await page.locator("#gear-slots .item-card").count() === 5);
  await page.click('#gear-tabs button[data-tab="pack"]');
  // implicit, prefix and suffix render as visually distinct groups: each
  // gets its own class/color, and a divider separates the fixed implicit
  // from what was crafted onto the item
  check("modsSplitByPrefixSuffixImplicit", await page.evaluate(() => {
    const card = [...document.querySelectorAll("#gear-pack .item-card")]
      .find(c => c.textContent.includes("Test Directive"));
    if (!card) return false;
    const hasImplicit = card.querySelector(".mod.implicit");
    const hasPrefix = card.querySelector(".mod.prefix");
    const hasSuffix = card.querySelector(".mod.suffix");
    const hasDivider = card.querySelector(".mod-divider");
    return !!hasImplicit && !!hasPrefix && !!hasSuffix && !!hasDivider &&
      hasPrefix.className !== hasSuffix.className;
  }));
  // __modsTestItem's affixes are deliberately interleaved (suffix, prefix,
  // suffix, prefix) in source order — this only passes if itemModsHTML
  // actually groups by kind rather than rendering insertion order
  check("modsGroupedPrefixesBeforeSuffixes", await page.evaluate(() => {
    const card = [...document.querySelectorAll("#gear-pack .item-card")]
      .find(c => c.textContent.includes("Test Directive"));
    if (!card) return false;
    const kinds = [...card.querySelectorAll(".mod.prefix, .mod.suffix")]
      .map(el => el.classList.contains("prefix") ? "prefix" : "suffix");
    const lastPrefixIdx = kinds.lastIndexOf("prefix");
    const firstSuffixIdx = kinds.indexOf("suffix");
    return kinds.filter(k => k === "prefix").length === 2 &&
      kinds.filter(k => k === "suffix").length === 2 &&
      lastPrefixIdx < firstSuffixIdx;
  }));
  check("packTabByClick", await page.evaluate(() =>
    !document.getElementById("tab-pack").classList.contains("hidden") &&
    document.getElementById("tab-equip").classList.contains("hidden")));
  check("packTabShowsCount", (await page.locator('#gear-tabs button[data-tab="pack"]').textContent()).includes("("));
  // backpack cards carry a Salvage button; rares arm on the first tap
  check("salvageBtnShown", await page.evaluate(() =>
    [...document.querySelectorAll("#gear-pack .sell-btn")].some(b => b.textContent.startsWith("Salvage +"))));
  const rareSell = await page.evaluateHandle(() =>
    [...document.querySelectorAll("#gear-pack .item-card")]
      .find(c => c.textContent.includes(window.__sellRare.name))
      .querySelector(".sell-btn"));
  await rareSell.click();
  check("rareSalvageArms", await page.evaluate(() => {
    const b = [...document.querySelectorAll("#gear-pack .item-card")]
      .find(c => c.textContent.includes(window.__sellRare.name))
      .querySelector(".sell-btn");
    return b.classList.contains("armed") && b.textContent.startsWith("Sure?") &&
      !!window.RL.itemById(window.__sellRare.id);
  }));
  await rareSell.click();
  check("armedSalvageSells", await page.evaluate(() =>
    !window.RL.itemById(window.__sellRare.id)));
  // backpack cards carry a Compare button that diffs the item's derived
  // stats against whatever's equipped in that slot, without actually
  // equipping it — __modsTestItem is a bulkhead (plating) rare with a
  // known implicit + four affixes, so its diff against the starting
  // plating should surface every one of those stats
  await page.click('#gear-tabs button[data-tab="pack"]');
  let cmpBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll("#gear-pack .item-card")]
      .find(c => c.textContent.includes(window.__modsTestItem.name))
      .querySelector(".compare-btn"));
  await cmpBtn.click();
  check("compareShowsDiff", await page.evaluate(() => {
    const card = [...document.querySelectorAll("#gear-pack .item-card")]
      .find(c => c.textContent.includes(window.__modsTestItem.name));
    const panel = card.closest(".item-card-wrap").querySelector(".item-compare");
    return !panel.classList.contains("hidden") && panel.querySelectorAll(".diff-row").length >= 4;
  }));
  check("compareLabelsVsEquipped", await page.evaluate(() => {
    const card = [...document.querySelectorAll("#gear-pack .item-card")]
      .find(c => c.textContent.includes(window.__modsTestItem.name));
    const panel = card.closest(".item-card-wrap").querySelector(".item-compare");
    return panel.querySelector(".diff-vs").textContent.startsWith("vs. ");
  }));
  check("compareDoesNotEquip", await page.evaluate(() =>
    window.RL.run.player.equip.plating !== window.__modsTestItem.id));
  // an open diff survives the full card rebuild every gear action
  // triggers: salvage a throwaway item (one-click for normals) and the
  // panel must still be open — with a freshly rendered diff, not a stale one
  await page.evaluate(() => {
    const RL = window.RL;
    window.__compareSurvivalFodder = RL.genItem(() => 0.5, "servo", "normal", 1);
    RL.run.player.items.push(window.__compareSurvivalFodder);
    RL.refreshGear();
  });
  check("compareStaysOpenAcrossRerender", await page.evaluate(() => {
    const card = [...document.querySelectorAll("#gear-pack .item-card")]
      .find(c => c.textContent.includes(window.__modsTestItem.name));
    const panel = card.closest(".item-card-wrap").querySelector(".item-compare");
    return !panel.classList.contains("hidden") && panel.querySelectorAll(".diff-row").length >= 4 &&
      card.querySelector(".compare-btn").textContent === "Hide diff";
  }));
  check("compareStaysOpenAfterSalvage", await page.evaluate(() => {
    const RL = window.RL;
    // sell the fodder the way the Salvage button does: sellItem + rebuild
    if (!RL.sellItem(window.__compareSurvivalFodder.id)) return false;
    RL.refreshGear();
    if (RL.itemById(window.__compareSurvivalFodder.id)) return false;   // must actually be gone
    const card = [...document.querySelectorAll("#gear-pack .item-card")]
      .find(c => c.textContent.includes(window.__modsTestItem.name));
    return !card.closest(".item-card-wrap").querySelector(".item-compare").classList.contains("hidden");
  }));
  // the old button handle died with the rebuild — re-grab it for the toggle
  cmpBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll("#gear-pack .item-card")]
      .find(c => c.textContent.includes(window.__modsTestItem.name))
      .querySelector(".compare-btn"));
  await cmpBtn.click();
  check("compareTogglesHidden", await page.evaluate(() => {
    const card = [...document.querySelectorAll("#gear-pack .item-card")]
      .find(c => c.textContent.includes(window.__modsTestItem.name));
    return card.closest(".item-card-wrap").querySelector(".item-compare").classList.contains("hidden");
  }));
  check("noCompareOnEquippedCards", await page.evaluate(() => {
    document.querySelector('#gear-tabs button[data-tab="equip"]').click();
    return document.querySelectorAll("#gear-slots .compare-btn").length === 0;
  }));

  await page.click('#gear-tabs button[data-tab="pack"]');
  await page.keyboard.press("4");
  check("suppliesTabByKey", await page.evaluate(() =>
    !document.getElementById("tab-supplies").classList.contains("hidden")));
  check("keysTabHiddenPreFoundry", await page.evaluate(() =>
    document.querySelector('#gear-tabs button[data-tab="keys"]').classList.contains("hidden")));
  await page.keyboard.press("Escape");
  check("gearPanelCloses", await page.evaluate(() => document.getElementById("inv").classList.contains("hidden")));

  // phone viewport: the fixed HUD must stay inside the visible area, and
  // the shop must fit and scroll rather than stranding its top off screen
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const vp = await page.evaluate(() => {
    const RL = window.RL;
    RL.run.player.souls = 5000;
    RL.showShop();
    const r = id => document.getElementById(id).getBoundingClientRect();
    const bar = r("actions"), top = r("topbar");
    const box = document.querySelector("#shop .box");
    const bb = box.getBoundingClientRect();
    return {
      barInside: bar.bottom <= window.innerHeight + 0.5 && bar.top >= 0 &&
        bar.left >= -0.5 && bar.right <= window.innerWidth + 0.5,
      topInside: top.top >= -0.5 && top.right <= window.innerWidth + 0.5,
      boxFits: bb.top >= -0.5 && bb.height <= window.innerHeight + 0.5,
      boxScrolls: box.scrollHeight > box.clientHeight,
      barHeightPublished: !!document.documentElement.style.getPropertyValue("--bar-h"),
      logClearsBar: document.getElementById("log").getBoundingClientRect().bottom <= bar.top + 0.5,
      resetZoomOk: RL.resetZoom() === true,
      // the bar spans the screen to wrap cleanly, so taps beside the
      // buttons must still reach the board underneath
      barLetsTapsThrough: (() => {
        document.getElementById("shop").classList.add("hidden");
        const hit = document.elementFromPoint(6, Math.round(bar.top + bar.height / 2));
        return !!hit && hit.id !== "actions";
      })(),
    };
  });
  for (const [k, v] of Object.entries(vp)) check(k, !!v);
  await page.evaluate(() => document.getElementById("shop").classList.add("hidden"));

  check("noPageErrors", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 5));
  await browser.close();
  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
