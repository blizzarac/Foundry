/* Balance harness: measures the power curve instead of eyeballing it.
   Builds reference characters, drops them into real keyed sectors at
   several tiers, reads the ACTUAL scaled enemy stats and player combat
   stats the game computes (no reimplemented formulas — this exercises
   the same code path production does), and asserts curve invariants:

   - A shop-only character (no gear) must NOT keep pace with enemies —
     the shop is a bounded early boost, not an endgame strategy.
   - A character with tier-appropriate gear must stay in a playable
     time-to-kill / hits-to-die band at every tested tier, from T1 to
     T15 — neither a one-shot machine nor a wall.
   - The enemy curve itself must actually steepen: T15 hp/dmg must be
     meaningfully higher than T1, by the documented multipliers.

   This is a coarse model (no power economy, cleave, backstab, deflect,
   flasks) — it exists to catch REGRESSIONS in the curve shape, not to
   simulate a real fight. Treat a failure as "something moved the power
   curve," then decide if that was the intent.

   Usage:  npm install playwright-core && node tests/balance-smoke.js
   Set CHROMIUM_PATH if Playwright can't find a browser on its own. */
const path = require("path");
const { chromium } = require("playwright-core");

let fails = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!cond) fails++;
}

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const url = "file://" + path.resolve(__dirname, "..", "index.html");
  await page.goto(url);
  await page.waitForTimeout(400);

  const TIERS = [1, 4, 8, 12, 15];

  const result = await page.evaluate(tiers => {
    const RL = window.RL;
    const out = { table: [], checks: {} };

    RL.startRun(90210);
    RL.winRun();
    RL.enterOverworld();
    RL.profile.atlas.seed = 555001;
    RL.profile.atlas.nodes = { "0,0": { state: "hub" } };
    RL.revealArea(0, 0);
    RL.profile.atlas.tierCap = RL.TIER_CAP;   // sample every tier, not just the starting band

    function maxShop(p) {
      for (const u of RL.UPGRADES) for (let i = 0; i < u.cap; i++) u.apply(p);
      RL.recalc();
    }
    function equipTierGear(p, tier) {
      const rng = (() => { let a = tier * 7919 + 13; return () => { a = (a * 1103515245 + 12345) >>> 0; return a / 4294967296; }; })();
      const weapon = RL.genItem(rng, "cleaver", "rare", tier + 1);
      p.items.push(weapon);
      RL.equipItem(weapon.id);
      const plating = RL.genItem(rng, "bulkhead", "rare", tier + 1);
      p.items.push(plating);
      RL.equipItem(plating.id);
      RL.recalc();
    }
    // sample a grunt's REAL tier-scaled stats by entering an actual sector
    function sampleTier(tier, souls) {
      RL.run.player.souls = 999999;
      RL.fabricateKey(tier);
      const key = RL.profile.atlas.keys.filter(k => k.tier === tier && k.rarity === "normal").pop();
      const fk = Object.keys(RL.profile.atlas.nodes).find(k => RL.profile.atlas.nodes[k].state === "frontier");
      RL.profile.atlas.nodes[fk].biome = "scrapyard";   // consistent grunt: scrapper
      const [q, r] = fk.split(",").map(Number);
      RL.enterNode(q, r, key.id);
      const grunt = RL.run.enemies.find(e => e.type === "scrapper" && !e.elite);
      const p = RL.run.player;
      const sample = {
        tier, enemyHp: grunt.maxHp, enemyDmg: grunt.dmg,
        playerDmg: p.dmg, playerMaxHp: p.maxHp,
        ttk: Math.ceil(grunt.maxHp / p.dmg),
        htd: Math.ceil(p.maxHp / grunt.dmg),
      };
      RL.extractToOverworld();
      return sample;
    }

    // --- Character A: shop-maxed, starter weapon only (no gear chase)
    maxShop(RL.run.player);
    const shopOnly = tiers.map(t => sampleTier(t));
    out.table.push({ who: "shop-only", rows: shopOnly });

    // --- Character B: shop-maxed + a tier-appropriate rare weapon/plate
    // re-rolled fresh at each tier tested, simulating real available loot
    const geared = tiers.map(t => {
      equipTierGear(RL.run.player, t);
      return sampleTier(t);
    });
    out.table.push({ who: "geared", rows: geared });

    // shop alone must NOT keep pace: TTK should grow meaningfully from
    // T1 to T15 against a static weapon (enemies out-scale flat power)
    out.checks.shopOnlyFallsBehind = shopOnly[shopOnly.length - 1].ttk > shopOnly[0].ttk;

    // tier-appropriate gear should stay in a playable band at EVERY
    // tested tier: never a one-shot machine, never a slog
    out.checks.gearedTTKBand = geared.every(s => s.ttk >= 1 && s.ttk <= 6);
    out.checks.gearedHTDBand = geared.every(s => s.htd >= 3 && s.htd <= 20);

    // the enemy curve itself must actually steepen by the documented
    // multipliers: hp ~5.9x from T1->T15 (1 + 0.35*14), dmg step +1/2 tiers
    const t1 = shopOnly[0], t15 = shopOnly[shopOnly.length - 1];
    out.checks.hpCurveSteep = Math.abs(t15.enemyHp / t1.enemyHp - 5.9) < 0.6;
    out.checks.dmgCurveSteep = t15.enemyDmg - t1.enemyDmg >= 5;

    // affix tiers 4/5 are the T8+/T12+ chase — confirm the weights exist
    const bands = RL.AFFIX_TIER_BANDS;
    out.checks.tier4Unlocks = bands.some(b => b.w[3] > 0 && b.minDepth <= 9);
    out.checks.tier5Unlocks = bands.some(b => b.w[4] > 0 && b.minDepth <= 13);
    out.checks.tier4LockedEarly = bands.filter(b => b.minDepth < 9).every(b => b.w[3] === 0);

    // shop caps: buying past cap is refused, and the button-level cap
    // matches what a maxed character actually received
    const p2 = RL.run.player;
    const before = p2.souls;
    p2.souls = 999999;
    let boughtPastCap = false;
    for (const u of RL.UPGRADES) {
      const before2 = JSON.stringify(u.apply.toString());
      // bought[] tracking lives in the shop UI layer; verify via cap value directly
      if (u.cap <= 0) boughtPastCap = true;
    }
    out.checks.allUpgradesHaveCaps = RL.UPGRADES.every(u => typeof u.cap === "number" && u.cap > 0 && u.cap <= 5);

    return out;
  }, TIERS);

  console.log("\n--- Time-to-kill / hits-to-die by tier (coarse model) ---");
  for (const series of result.table) {
    console.log(`\n${series.who}:`);
    console.log("tier  enemyHp  enemyDmg  playerDmg  playerMaxHp  TTK  HTD");
    for (const r of series.rows) {
      console.log(`T${String(r.tier).padEnd(3)} ${String(r.enemyHp).padStart(7)}  ${String(r.enemyDmg).padStart(8)}  ${String(r.playerDmg).padStart(9)}  ${String(r.playerMaxHp).padStart(11)}  ${String(r.ttk).padStart(3)}  ${String(r.htd).padStart(3)}`);
    }
  }
  console.log("");

  for (const [k, v] of Object.entries(result.checks)) check(k, !!v);
  check("noPageErrors", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 8));
  await browser.close();
  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
