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

    // the flat shop upgrades are gone — permanent frame power is the
    // lattice now, so the "everything maxed" baseline allocates every node
    function maxTree() {
      RL.profile.tree = { pts: 0, nodes: RL.TREE_NODES.map(n => n.id) };
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

    // --- Character A: bare frame, starter weapon only (no gear chase, no
    // lattice) — the do-nothing baseline enemies must out-scale
    const bare = tiers.map(t => sampleTier(t));
    out.table.push({ who: "bare-frame", rows: bare });

    // --- Character B: a tier-appropriate rare weapon/plate re-rolled
    // fresh at each tier tested, simulating real available loot
    const geared = tiers.map(t => {
      equipTierGear(RL.run.player, t);
      return sampleTier(t);
    });
    out.table.push({ who: "geared", rows: geared });

    // --- Character C: same gear plus the ENTIRE frame lattice (all 3
    // keystones at once — a stronger frame than any real build can be)
    maxTree();
    const latticed = tiers.map(t => {
      equipTierGear(RL.run.player, t);
      return sampleTier(t);
    });
    out.table.push({ who: "geared+full-lattice", rows: latticed });

    // a static frame must NOT keep pace: TTK should grow meaningfully from
    // T1 to T15 against a static weapon (enemies out-scale flat power)
    out.checks.bareFrameFallsBehind = bare[bare.length - 1].ttk > bare[0].ttk;

    // tier-appropriate gear should stay in a playable band at EVERY
    // tested tier: never a one-shot machine, never a slog
    out.checks.gearedTTKBand = geared.every(s => s.ttk >= 1 && s.ttk <= 6);
    out.checks.gearedHTDBand = geared.every(s => s.htd >= 3 && s.htd <= 20);

    // even the impossible everything-lattice build stays inside a sane
    // band: the full tree is a climb's worth of milestones, not a cheat
    out.checks.fullLatticeTTKBand = latticed.every(s => s.ttk >= 1 && s.ttk <= 6);
    out.checks.fullLatticeHTDBand = latticed.every(s => s.htd >= 3 && s.htd <= 30);

    // the enemy curve itself must actually steepen by the documented
    // multipliers: hp ~5.9x from T1->T15 (1 + 0.35*14), dmg step +1/2 tiers
    const t1 = bare[0], t15 = bare[bare.length - 1];
    out.checks.hpCurveSteep = Math.abs(t15.enemyHp / t1.enemyHp - 5.9) < 0.6;
    out.checks.dmgCurveSteep = t15.enemyDmg - t1.enemyDmg >= 5;

    // affix tiers 4/5 are the T8+/T12+ chase — confirm the weights exist
    const bands = RL.AFFIX_TIER_BANDS;
    out.checks.tier4Unlocks = bands.some(b => b.w[3] > 0 && b.minDepth <= 9);
    out.checks.tier5Unlocks = bands.some(b => b.w[4] > 0 && b.minDepth <= 13);
    out.checks.tier4LockedEarly = bands.filter(b => b.minDepth < 9).every(b => b.w[3] === 0);

    // the lattice's total flat-stat budget stays bounded: summing every
    // node's effects must land well under what tier gear provides, so
    // milestones supplement the gear chase instead of replacing it
    const treeTotals = {};
    for (const n of RL.TREE_NODES) if (n.effect)
      for (const k in n.effect) treeTotals[k] = (treeTotals[k] || 0) + n.effect[k];
    out.checks.latticeDmgBounded = (treeTotals.dmg || 0) <= 12;
    out.checks.latticeHpBounded = (treeTotals.maxHpBonus || 0) <= 65;

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
