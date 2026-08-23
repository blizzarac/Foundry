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

    const u = RL.genUnique(mk);
    out.unique = u.rarity === "unique" && !!u.lore && u.affixes.length === 1;

    const arm = RL.genArmoryItem(mk);
    out.armoryIsRareWeapon = arm.rarity === "rare" && RL.BASE_TYPES[arm.base].slot === "weapon";

    const cor = RL.genCorruptedItem(mk, 3);
    out.corruptedHasDownside = cor.corrupted && cor.affixes.some(a => a.kind === "corrupt");
    out.corruptRejectsOrbs = !RL.canApplyOrb("exalt", cor).ok && !RL.canApplyOrb("chaos", cor).ok;

    // equip flow: implicit applies and reverts
    const plate = RL.genItem(mk, "plating", "normal", 1);
    p.items.push(plate);
    const hpBefore = p.maxHp;
    RL.equipItem(plate.id);
    out.implicitApplies = p.maxHp === hpBefore + 3;
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
    out.bareFistsFallback = RL.getActiveWeaponType().name === "Bare Fists" && p.dmg === 1 + p.bonusDmg + totals.dmg;

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
  check("packTabByClick", await page.evaluate(() =>
    !document.getElementById("tab-pack").classList.contains("hidden") &&
    document.getElementById("tab-equip").classList.contains("hidden")));
  check("packTabShowsCount", (await page.locator('#gear-tabs button[data-tab="pack"]').textContent()).includes("("));
  await page.keyboard.press("4");
  check("suppliesTabByKey", await page.evaluate(() =>
    !document.getElementById("tab-supplies").classList.contains("hidden")));
  check("keysTabHiddenPreFoundry", await page.evaluate(() =>
    document.querySelector('#gear-tabs button[data-tab="keys"]').classList.contains("hidden")));
  await page.keyboard.press("Escape");
  check("gearPanelCloses", await page.evaluate(() => document.getElementById("inv").classList.contains("hidden")));

  check("noPageErrors", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 5));
  await browser.close();
  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
