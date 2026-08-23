/* Band-boss + pinnacle acceptance suite: each gate band wakes the guardian
   config assigns it (SENTINEL -> WARDEN -> CRUCIBLE), every new verb
   telegraphs and resolves by the same grammar the SENTINEL taught, the
   FORGE-PRIME runs its phases (shield only in the middle, stingier vent
   at the end), and the apex node lifecycle works: surfaces when the cap
   tops out, eats only a top-tier key, pays lattice points + a guaranteed
   Unique per kill, and always grows back. Runs the real game headless.

   Usage:  npm install playwright-core && node tests/boss-smoke.js
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
    const CFG = RL.CFG;
    const out = {};
    const key = (q, r) => q + "," + r;
    const hexDist = RL.hexDist;

    RL.startRun(31337);
    RL.winRun();
    RL.enterOverworld();
    RL.profile.atlas.seed = 424243;
    RL.profile.atlas.nodes = { "0,0": { state: "hub" } };
    RL.revealArea(0, 0);
    RL.run.player.souls = 9999999;

    out.newBossIdentity = ["warden", "crucible", "prime"].every(t =>
      RL.ENEMY[t] && RL.ENEMY[t].name && RL.ENEMY[t].color &&
      typeof RL.ENEMY[t].hp === "number" && typeof RL.ENEMY[t].dmg === "number");

    // --- band -> guardian comes from config, live, with sentinel fallback
    const enterGateAt = (nk, band) => {
      RL.profile.atlas.nodes[nk] = { state: "gate", band, wreck: 0 };
      RL.profile.atlas.tierCap = Math.max(RL.profile.atlas.tierCap, band);
      RL.fabricateKey(band);
      const kk = RL.profile.atlas.keys.filter(k => k.tier === band && k.rarity === "normal").pop();
      const [q, r] = nk.split(",").map(Number);
      return RL.enterNode(q, r, kk.id);
    };
    enterGateAt("1,0", 4);
    out.band4WakesSentinel = RL.run.floorConf.bossType === "sentinel" &&
      RL.run.enemies.some(e => e.type === "sentinel");
    RL.extractToOverworld();
    enterGateAt("2,0", 8);
    out.band8WakesWarden = RL.run.floorConf.bossType === "warden" &&
      RL.run.enemies.some(e => e.type === "warden");

    // === WARDEN verbs, driven in its real arena ===
    const w = RL.run.enemies.find(e => e.type === "warden");
    const p = RL.run.player;
    // barrage marks where you STOOD — your hex plus its ring, dodged by
    // any two hexes of motion
    p.q = w.q + 3; p.r = w.r;
    w.atkCycle = 0; w.bossCount = 0; w.state = "idle";
    RL.wardenAct(w, null, 3);
    const standing = key(p.q, p.r);
    out.barrageTracksStanding = w.state === "windup" && w.windupKind === "barrage" &&
      w.windupTimer === 2 && w.windupHexes.includes(standing) &&
      w.windupHexes.length >= 6;
    p.q += 2;   // two hexes of motion clears the mark
    out.barrageDodgeable = !w.windupHexes.includes(key(p.q, p.r));
    // crossfire chains: red axis first, amber axis spun up on resolve
    w.atkCycle = 1; w.state = "idle";
    RL.wardenAct(w, null, 3);
    out.crossfireTelegraphs = w.windupKind === "cross1" &&
      w.windupHexes.length > 0 && Array.isArray(w.windupNext) && w.windupNext.length > 0;
    const amber = w.windupNext.slice();
    RL.resolveNewBossStrike(w, w.windupHexes, false);
    out.crossfireChains = w.state === "windup" && w.windupKind === "cross2" &&
      JSON.stringify(w.windupHexes) === JSON.stringify(amber);
    // point-defense arms only up close
    w.atkCycle = 2; w.state = "idle";
    p.q = w.q + 1; p.r = w.r;
    RL.wardenAct(w, null, 1);
    out.repelRingAdjacent = w.windupKind === "repel" &&
      w.windupHexes.every(k => { const [q, r] = k.split(",").map(Number); return hexDist(q, r, w.q, w.r) === 1; });
    // frontal shield: head-on strikes scatter, flanks land, overload opens it
    w.state = "idle"; w.stagger = 0; w.dir = 0;
    p.q = w.q + 1; p.r = w.r;   // dead ahead of dir 0
    const hpBefore = w.hp;
    RL.strikeOne(w, true);
    out.frontShieldScatters = w.hp === hpBefore;
    w.dir = 3;                  // now facing away — same hex is its rear
    RL.strikeOne(w, true);
    out.flankBeatsShield = w.hp < hpBefore;
    // overheat window after every third attack
    w.bossCount = 3; w.state = "idle"; w.stagger = 0;
    RL.wardenAct(w, null, 3);
    out.wardenVents = w.stagger === 2 && w.bossCount === 0;
    RL.extractToOverworld();

    // mapping is LIVE config: rewire band 8 and the gate wakes a different boss
    const savedMap = RL.CFG.levelGen.gateBossByBand["8"];
    RL.CFG.levelGen.gateBossByBand["8"] = "crucible";
    enterGateAt("3,0", 8);
    out.gateBossMappingLive = RL.run.floorConf.bossType === "crucible";
    RL.CFG.levelGen.gateBossByBand["8"] = savedMap;

    // === CRUCIBLE verbs (this arena's boss is one, thanks to the rewire) ===
    const c = RL.run.enemies.find(e => e.type === "crucible");
    const pc = RL.run.player;
    pc.q = c.q + 3; pc.r = c.r;
    c.atkCycle = 0; c.bossCount = 0; c.state = "idle";
    RL.crucibleAct(c, null, 3);
    const distsOf = hexes => hexes.map(k => { const [q, r] = k.split(",").map(Number); return hexDist(q, r, c.q, c.r); });
    out.waveNearRingFirst = c.windupKind === "wave1" &&
      distsOf(c.windupHexes).every(d => d === 2) &&
      Array.isArray(c.windupNext) && distsOf(c.windupNext).every(d => d >= 3 && d <= 4);
    RL.resolveNewBossStrike(c, c.windupHexes, false);
    out.waveRollsOutward = c.state === "windup" && c.windupKind === "wave2" &&
      distsOf(c.windupHexes).every(d => d >= 3 && d <= 4);
    // the cold spot: adjacent-to-hull is never touched by either half
    out.waveColdSpotAdjacent = !c.windupHexes.includes(key(c.q + 1, c.r));
    c.atkCycle = 1; c.state = "idle";
    RL.crucibleAct(c, null, 2);
    out.spokesShortRange = c.windupKind === "spokes" &&
      distsOf(c.windupHexes).every(d => d <= 2);
    // forge-call fabricates rippers
    const rippersBefore = RL.run.enemies.filter(e => e.type === "ripper").length;
    c.atkCycle = 2; c.state = "idle";
    RL.crucibleAct(c, null, 4);
    out.forgeCallSummons = RL.run.enemies.filter(e => e.type === "ripper").length === rippersBefore + 2;
    RL.extractToOverworld();

    // === band 12 gate wakes the CRUCIBLE for real, and its fall opens the summit
    RL.profile.atlas.tierCap = 12;
    enterGateAt("4,0", 12);
    out.band12WakesCrucible = RL.run.floorConf.bossType === "crucible";
    const c12 = RL.run.enemies.find(e => e.type === "crucible");
    RL.hurtEnemy(c12, 999999);
    out.lastGateTopsCap = RL.profile.atlas.tierCap === RL.TIER_CAP;
    const apexKey = Object.keys(RL.profile.atlas.nodes).find(k => RL.profile.atlas.nodes[k].state === "apex");
    out.apexSurfacesAtCap = !!apexKey && RL.profile.atlas.nodes[apexKey].band === RL.TIER_CAP;
    RL.extractToOverworld();

    // === the apex: top-tier key only, FORGE-PRIME, phases, rewards, regrowth
    RL.fabricateKey(RL.TIER_CAP - 1);
    const wrongKey = RL.profile.atlas.keys.filter(k => k.tier === RL.TIER_CAP - 1).pop();
    const [aq, ar] = apexKey.split(",").map(Number);
    out.apexRejectsLowKey = !RL.enterNode(aq, ar, wrongKey.id);
    RL.fabricateKey(RL.TIER_CAP);
    const topKey = RL.profile.atlas.keys.filter(k => k.tier === RL.TIER_CAP).pop();
    out.apexAcceptsTopKey = RL.enterNode(aq, ar, topKey.id);
    out.apexArena = RL.run.floorConf.bossType === "prime" &&
      RL.run.floorConf.R === CFG.levelGen.apex.arenaR &&
      RL.run.floorConf.biomeName === "The Foundry Heart";
    const pr = RL.run.enemies.find(e => e.type === "prime");
    const pp = RL.run.player;
    // phase 1: no shield, donut/charge only
    pp.q = pr.q + 2; pp.r = pr.r;
    pr.atkCycle = 0; pr.bossCount = 0; pr.state = "idle";
    RL.primeAct(pr, null, 2);
    out.primeP1Donut = pr.windupKind === "donut" && pr.frontShield === false;
    // phase 2: shield up, crossfire joins the rotation
    pr.hp = Math.floor(pr.maxHp * 0.5);
    pr.state = "idle"; pr.atkCycle = 1;
    RL.primeAct(pr, null, 2);
    out.primeP2Shielded = pr.frontShield === true && pr.windupKind === "cross1";
    // phase 3: shield drops, waves join, and the vent comes a beat later
    pr.hp = Math.floor(pr.maxHp * 0.2);
    pr.state = "idle"; pr.atkCycle = 0;
    RL.primeAct(pr, null, 2);
    out.primeP3Waves = pr.frontShield === false && pr.windupKind === "wave1";
    pr.state = "idle"; pr.stagger = 0; pr.bossCount = 3; pr.atkCycle = 3;
    RL.primeAct(pr, null, 2);
    out.primeP3VentsLater = pr.stagger === 0 && pr.bossCount === 4;
    RL.primeAct(pr, null, 2);
    out.primeVentsAtFour = pr.stagger === 2 && pr.bossCount === 0;
    // the kill: lattice points, a guaranteed Unique, and the Heart regrows
    const ptsBefore = RL.treeState().pts;
    const uniquesBefore = pp.items.filter(i => i.rarity === "unique").length;
    RL.hurtEnemy(pr, 999999);
    out.apexPaysLatticePoints = RL.treeState().pts === ptsBefore + CFG.levelGen.apex.treePoints;
    out.apexPaysUnique = pp.items.filter(i => i.rarity === "unique").length === uniquesBefore + 1;
    out.apexKillCounted = RL.profile.apexKills === 1;
    out.apexNodeCleared = RL.profile.atlas.nodes[apexKey].state === "cleared";
    const regrown = Object.keys(RL.profile.atlas.nodes).find(k =>
      k !== apexKey && RL.profile.atlas.nodes[k].state === "apex");
    out.apexRegrows = !!regrown;
    RL.extractToOverworld();

    // ensureApexNode backfills a capped save that somehow lost its apex
    for (const k in RL.profile.atlas.nodes)
      if (RL.profile.atlas.nodes[k].state === "apex") delete RL.profile.atlas.nodes[k];
    RL.ensureApexNode();
    out.ensureApexBackfills = Object.values(RL.profile.atlas.nodes).some(n => n.state === "apex");

    // validator: an unknown guardian in the mapping or a missing apex
    // section is a named boot error
    const bad1 = JSON.parse(JSON.stringify(CFG));
    bad1.levelGen.gateBossByBand["8"] = "notABoss";
    out.validatorRejectsUnknownGuardian = RL.validateConfig(bad1)
      .some(e => e.includes("gateBossByBand") && e.includes("notABoss"));
    const bad2 = JSON.parse(JSON.stringify(CFG));
    delete bad2.levelGen.apex;
    out.validatorRejectsMissingApex = RL.validateConfig(bad2).some(e => e.includes("levelGen.apex"));

    try { localStorage.removeItem("ironhex-foundry"); localStorage.removeItem("ironhex-run"); } catch (e) {}
    return out;
  });
  for (const [k, v] of Object.entries(r)) check(k, !!v);

  check("noPageErrors", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 8));
  await browser.close();
  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
