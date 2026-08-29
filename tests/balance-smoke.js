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

  const TIERS = [1, 4, 8, 12, 15, 25, 40];   // 25/40 sample the open-ended post-ladder curve

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
    // lattice now, so the "everything maxed" baseline allocates every
    // node reachable by a single character: keystones are exclusive (one
    // at a time), so the other two branches' keystone + their locked tip
    // clusters are unreachable no matter how many points you have — the
    // real achievable ceiling, not the sum of three mutually exclusive builds
    function maxTree() {
      // exclusivity carves out: the two non-chosen keystones with their tip
      // clusters AND the generated deep vaults hanging past those clusters,
      // plus the two non-chosen root specials with their amplifier tails —
      // this allocation bypasses canAllocateNode, so illegal content has to
      // be excluded by hand or the ceiling models an impossible character
      const lockedOut = [
        "svK", "svJ", "svc1", "svc2", "svc3", "svv1", "svv2", "svv3", "svvN",
        "syK", "syJ", "syc1", "syc2", "syc3", "syv1", "syv2", "syv3", "syvN",
        "spCharge", "spBarrage", "spChargeA1", "spChargeA2", "spChargeA3",
        "spBarrageA1", "spBarrageA2", "spBarrageA3",
      ];
      RL.profile.tree = { pts: 0, nodes: RL.TREE_NODES.filter(n => !lockedOut.includes(n.id)).map(n => n.id) };
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
      // fabrication caps at the ladder ceiling; deeper tiers exist only as
      // found keys, so the harness plants one directly
      if (tier <= RL.TIER_CAP) RL.fabricateKey(tier);
      else RL.profile.atlas.keys.push(RL.makeKey(tier));
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
    // tested tier: never a one-shot machine, never a slog. This coarse
    // model excludes riposte/cleave/backstab, so its TTK reads higher than
    // a real fight — the band is loose on purpose; a wide gap from real
    // play is a modeling limit, not a balance problem, unless it widens
    // further from here
    // the tight playable bands govern the LADDER (T1-T15) — the tuned,
    // guardian-gated climb every run goes through
    const ladder = s => s.tier <= RL.TIER_CAP;
    out.checks.gearedTTKBand = geared.filter(ladder).every(s => s.ttk >= 1 && s.ttk <= 8);
    out.checks.gearedHTDBand = geared.filter(ladder).every(s => s.htd >= 3 && s.htd <= 20);

    // even the full-allocation build stays inside a sane band. With the
    // 300+ node tree that ceiling is a several-hundred-purge lifetime
    // chase, so the band is generous — the compounding deep tiers are what
    // actually cap it, and the deep checks below prove they still do
    out.checks.fullLatticeTTKBand = latticed.filter(ladder).every(s => s.ttk >= 1 && s.ttk <= 6);
    out.checks.fullLatticeHTDBand = latticed.filter(ladder).every(s => s.htd >= 3 && s.htd <= 40);

    // the enemy curve itself must actually steepen by the documented
    // multipliers: hp ~6.9x from T1->T15 (1 + 0.42*14), dmg step +1/2 tiers
    const byTier = (rows, t) => rows.find(s => s.tier === t);
    const t1 = bare[0], t15 = byTier(bare, 15);
    out.checks.hpCurveSteep = Math.abs(t15.enemyHp / t1.enemyHp - 6.9) < 0.6;
    out.checks.dmgCurveSteep = t15.enemyDmg - t1.enemyDmg >= 5;

    // past the ladder the game is open-ended AND rigged against the
    // player on purpose: enemies compound per deep tier while gear only
    // grows linearly, so every build has a tier that finally stops it.
    // T25 must still be a real fight; by T40 the wall should be visibly
    // closing in (enemy growth strictly outpacing gear growth).
    const [b25, b40] = [byTier(bare, 25), byTier(bare, 40)];
    out.checks.deepEnemiesKeepScaling = b25.enemyHp > t15.enemyHp && b40.enemyHp > b25.enemyHp &&
      b25.enemyDmg > t15.enemyDmg && b40.enemyDmg > b25.enemyDmg;
    out.checks.deepGearKeepsScaling = byTier(geared, 40).playerMaxHp > byTier(geared, 15).playerMaxHp;
    out.checks.deepT25StillPlayable = byTier(latticed, 25).ttk <= 12 && byTier(latticed, 25).htd >= 3;
    const enemyHpGrowth = b40.enemyHp / t15.enemyHp;
    const gearHpGrowth = byTier(geared, 40).playerMaxHp / byTier(geared, 15).playerMaxHp;
    out.checks.deepTiersOutpaceGear = enemyHpGrowth > gearHpGrowth * 1.5 &&
      byTier(latticed, 40).ttk > byTier(latticed, 25).ttk;

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
    // budgets for the 300+ node tree (the whole-table sum, including the
    // mutually-exclusive content no one character can hold): raw damage
    // stays scarce on purpose — the tree's bulk is utility and integrity
    out.checks.latticeDmgBounded = (treeTotals.dmg || 0) <= 20;
    out.checks.latticeHpBounded = (treeTotals.maxHpBonus || 0) <= 130;

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
