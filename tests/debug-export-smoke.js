/* Debug export/import acceptance suite: the bundle a player would send us
   to reproduce a bug, and the round-trip that restores it in a fresh
   browser session.

   Usage:  npm install playwright-core && node tests/debug-export-smoke.js
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
  page.on("dialog", d => d.dismiss());   // import failures alert(); never let one hang the run
  const url = "file://" + path.resolve(__dirname, "..", "index.html");
  await page.goto(url);
  await page.waitForTimeout(400);

  // ============================ prologue export ============================
  const r1 = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};
    RL.startRun(2468);
    RL.actWait(); RL.actWait(); RL.actWait();
    const bundle = RL.buildDebugBundle();
    out.hasShape = bundle.exportVersion === 1 && bundle.game === "ironhex" &&
      typeof bundle.gameVersion === "string" && typeof bundle.exportedAt === "string";
    out.campaignMetaPresent = !!bundle.campaignMeta && typeof bundle.campaignMeta === "object";
    out.profileNullPrePrologue = bundle.profile === null;   // Foundry not unlocked yet
    out.runCheckpointMatches = !!bundle.runCheckpoint &&
      bundle.runCheckpoint.run.turn === RL.run.turn &&
      bundle.runCheckpoint.run.seed === RL.run.seed &&
      bundle.runCheckpoint.run.player.hp === RL.run.player.hp;
    out.contextMatches = bundle.context.mode === "campaign" && bundle.context.screen === "game" &&
      bundle.context.turn === RL.run.turn;
    out.jsonSafe = (() => { try { JSON.stringify(bundle); return true; } catch (e) { return false; } })();
    return { bundle, out };
  });
  for (const [k, v] of Object.entries(r1.out)) check(k, !!v);

  // round-trip: import that exact bundle into a *fresh* page and confirm
  // the resumed prologue run matches turn-for-turn
  await page.reload();
  await page.waitForTimeout(300);
  const r2 = await page.evaluate(bundle => {
    const RL = window.RL;
    const out = {};
    const res = RL.importDebugState(JSON.stringify(bundle));
    out.importOk = res.ok === true;
    return out;
  }, r1.bundle);
  for (const [k, v] of Object.entries(r2)) check(k, !!v);
  await page.reload();
  await page.waitForTimeout(400);
  const r3 = await page.evaluate(bundle => {
    const RL = window.RL;
    const out = {};
    out.menuOffersResume = document.getElementById("begin-btn").textContent === "Resume run";
    out.resumed = RL.resumeRun();
    out.turnMatches = RL.run.turn === bundle.runCheckpoint.run.turn;
    out.seedMatches = RL.run.seed === bundle.runCheckpoint.run.seed;
    out.hpMatches = RL.run.player.hp === bundle.runCheckpoint.run.player.hp;
    out.modeMatches = RL.run.mode === "campaign";
    return out;
  }, r1.bundle);
  for (const [k, v] of Object.entries(r3)) check(k, !!v);

  // ============================ endgame export ============================
  const r4 = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};
    RL.startRun(13579);
    RL.winRun();
    const per = JSON.parse(localStorage.getItem("ironhex") || "{}");
    per.deaths = 3;   // distinguishable value to check round-trip fidelity
    localStorage.setItem("ironhex", JSON.stringify(per));
    RL.enterOverworld();
    RL.profile.atlas.seed = 99001;
    RL.run.player.souls = 777;
    RL.fabricateKey(1);

    const bundle = RL.buildDebugBundle();
    out.profileIncluded = !!bundle.profile && bundle.profile.atlas.unlocked === true &&
      bundle.profile.atlas.seed === 99001;
    out.campaignDeathsIncluded = bundle.campaignMeta.deaths === 3;
    out.contextOverworld = bundle.context.mode === "overworld" && bundle.context.screen === "overworld";
    // overworld browsing has no active sector, so no fresh run checkpoint —
    // whatever was left over from the prologue run should NOT leak through
    out.noStaleRunCheckpoint = bundle.runCheckpoint === null;

    // now enter a keyed sector and export again — this time a checkpoint should exist
    const fk = Object.keys(RL.profile.atlas.nodes).find(k => RL.profile.atlas.nodes[k].state === "frontier");
    const [q, r] = fk.split(",").map(Number);
    const kk = RL.profile.atlas.keys.find(k => k.tier === 1);
    RL.enterNode(q, r, kk.id);
    RL.actWait();
    const bundle2 = RL.buildDebugBundle();
    out.sectorCheckpointIncluded = !!bundle2.runCheckpoint &&
      bundle2.runCheckpoint.run.mode === "sector" &&
      bundle2.runCheckpoint.run.sectorNode === fk;
    return { bundle: bundle2, out };
  });
  for (const [k, v] of Object.entries(r4.out)) check(k, !!v);

  // round-trip the endgame+sector bundle into a fresh page
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(bundle => window.RL.importDebugState(JSON.stringify(bundle)), r4.bundle);
  await page.reload();
  await page.waitForTimeout(400);
  const r5 = await page.evaluate(bundle => {
    const RL = window.RL;
    const out = {};
    out.profileRestored = RL.profile && RL.profile.atlas.seed === 99001;
    out.campaignMetaRestored = JSON.parse(localStorage.getItem("ironhex") || "{}").deaths === 3;
    out.menuOffersResume = document.getElementById("begin-btn").textContent === "Resume run";
    out.resumed = RL.resumeRun();
    out.sectorNodeMatches = RL.run.sectorNode === bundle.runCheckpoint.run.sectorNode;
    out.tierMatches = RL.run.floorConf.tier === bundle.runCheckpoint.run.floorConf.tier;
    return out;
  }, r4.bundle);
  for (const [k, v] of Object.entries(r5)) check(k, !!v);

  // ============================ malformed import ============================
  const r6 = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};
    out.rejectsGarbage = RL.importDebugState("not json at all").ok === false;
    out.rejectsWrongGame = RL.importDebugState(JSON.stringify({ game: "somethingElse" })).ok === false;
    return out;
  });
  for (const [k, v] of Object.entries(r6)) check(k, !!v);

  // ============================ last-run outcome tracking ============================
  // a compact snapshot of the last level died or won — tier, boss, cause,
  // turn/kill counts, loadout — lives in campaignMeta so it rides along
  // in every debug export without any separate storage or export button
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForTimeout(300);
  const r7 = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};

    out.noLastOutcomeInitially = RL.persist().lastOutcome === undefined;

    // every action type the player can take gets its own actionLog entry —
    // not just a snapshot of the terminal event. Drive one of each on the
    // real prologue floor 1, direction-agnostic since terrain is generated.
    RL.startRun(9010);
    const DIRS6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const tryDirs = fn => DIRS6.some(([dq, dr]) => fn(dq, dr));
    const ps = RL.run.player;
    out.stepSucceeded = tryDirs((dq, dr) => RL.actStep(dq, dr));
    out.waitSucceeded = RL.actWait();
    ps.st = ps.maxSt;
    out.dashSucceeded = tryDirs((dq, dr) => RL.actRoll(dq, dr));
    ps.hp = Math.max(1, ps.maxHp - 3);
    out.flaskSucceeded = RL.actFlask();
    ps.st = ps.maxSt;
    out.parrySucceeded = RL.actParry();
    const target = RL.spawnEnemy("scrapper", ps.q + 1, ps.r);   // always hex-adjacent by construction
    ps.st = ps.maxSt;
    out.attackSucceeded = RL.actAttack(target);
    const types = RL.run.actionLog.map(a => a.type);
    out.logHasStep = types.includes("step");
    out.logHasWait = types.includes("wait");
    out.logHasDash = types.includes("dash");
    out.logHasFlask = types.includes("flask");
    out.logHasParryAttemptAndResult = types.includes("parry") &&
      (types.includes("parry-miss") || types.includes("parry-hit"));
    out.logHasAttackAndHit = types.includes("attack") && types.includes("hit");
    out.logEntriesHaveTurnNumbers = RL.run.actionLog.every(a => typeof a.turn === "number");
    // still a live, un-ended run: the checkpoint should carry the log too
    RL.saveRun();
    const cp = RL.loadRunCheckpoint();
    out.actionLogSurvivesCheckpoint = Array.isArray(cp.run.actionLog) &&
      cp.run.actionLog.length === RL.run.actionLog.length;

    // prologue death: a real attacker deals the killing blow
    RL.startRun(9001);
    const p = RL.run.player;
    const killer = RL.spawnEnemy("crusher", p.q + 1, p.r);
    p.hp = 1;
    RL.hurtPlayer(killer, 5);
    let lo = RL.persist().lastOutcome;
    out.deathRecordsKindSubCause = lo.kind === "died" && lo.sub === "prologue" && lo.cause === "crusher";
    out.deathRecordsTierAndBiome = lo.tier === 1 && lo.biome === "Scrapyard";
    out.deathRecordsCombatCounts = typeof lo.turn === "number" && typeof lo.kills === "number";
    out.deathRecordsEquip = !!lo.equip && !!lo.equip.weapon && lo.equip.weapon.base === "blade";
    out.deathHasNoKeyInfo = lo.keyRarity === null && lo.keyMods === null;   // prologue carries no key
    out.deathActionsIncludeHurtAndEndWithDied = Array.isArray(lo.actions) &&
      lo.actions.some(a => a.type === "hurt" && a.source === "crusher") &&
      lo.actions[lo.actions.length - 1].type === "died";

    // prologue win
    RL.startRun(9003);
    RL.winRun();
    lo = RL.persist().lastOutcome;
    out.prologueWinRecorded = lo.kind === "won" && lo.sub === "prologue" && lo.cause === null;

    // endgame: sector purge records "won"/"sector" with the key's own info
    RL.enterOverworld();
    RL.profile.atlas.seed = 55501;
    RL.profile.atlas.nodes = { "0,0": { state: "hub" } };
    RL.revealArea(0, 0);
    RL.run.player.souls = 999999;
    RL.fabricateKey(1);
    const fk = Object.keys(RL.profile.atlas.nodes).find(k => RL.profile.atlas.nodes[k].state === "frontier");
    const [q, r] = fk.split(",").map(Number);
    const kk = RL.profile.atlas.keys.filter(k => k.tier === 1 && k.rarity === "normal").pop();
    RL.enterNode(q, r, kk.id);
    out.actionLogResetsPerSector = RL.run.actionLog.length === 0;   // a fresh attempt, not carried from the prologue
    for (const el of [...RL.run.enemies].filter(x => x.elite)) RL.hurtEnemy(el, 99999);
    lo = RL.persist().lastOutcome;
    out.sectorWinRecorded = lo.kind === "won" && lo.sub === "sector" && lo.tier === 1;
    out.sectorWinHasKeyInfo = lo.keyRarity === "normal" && Array.isArray(lo.keyMods);
    out.sectorWinActionsEndWithWon = Array.isArray(lo.actions) && lo.actions.length > 0 &&
      lo.actions[lo.actions.length - 1].type === "won" && lo.actions.some(a => a.type === "hit");

    // detonation death, still inside this purged-but-not-extracted sector
    // (the volatile check only fires in mode "sector"): force the flag
    // and kill a machine adjacent to the player — the cause should be
    // the detonating machine, not null
    const pp = RL.run.player;
    const bomb = RL.spawnEnemy("scrapper", pp.q + 1, pp.r);
    bomb.hp = 1;
    pp.hp = 1;
    RL.run.floorConf.volatile = true;
    RL.hurtEnemy(bomb, 1);
    lo = RL.persist().lastOutcome;
    out.detonationRecordsCause = lo.kind === "died" && lo.cause === "scrapper";
    // this attempt's actions span BOTH the earlier purge and this death —
    // the log isn't reset until the next enterNode, so the whole story of
    // what happened in this sector node stays together
    out.detonationActionsSpanBothEvents = Array.isArray(lo.actions) &&
      lo.actions.some(a => a.type === "won") && lo.actions[lo.actions.length - 1].type === "died";
    RL.extractToOverworld();
    RL.run.player.souls = 999999;   // the death above wiped cores; restock for the next fabrication

    // gate clear: sub "gate", bossType names the actual guardian for the band
    RL.profile.atlas.nodes["1,0"] = { state: "gate", band: 4, wreck: 0 };
    RL.profile.atlas.tierCap = 4;
    RL.fabricateKey(4);
    const gk = RL.profile.atlas.keys.filter(k => k.tier === 4 && k.rarity === "normal").pop();
    RL.enterNode(1, 0, gk.id);
    out.gateActionsResetFromPriorSector = RL.run.actionLog.length === 0;
    const guardian = RL.run.enemies.find(x => x.type === RL.run.floorConf.bossType);
    RL.hurtEnemy(guardian, 99999);
    lo = RL.persist().lastOutcome;
    out.gateWinRecorded = lo.kind === "won" && lo.sub === "gate" && lo.bossType === "sentinel";
    out.gateWinActionsEndWithWon = Array.isArray(lo.actions) &&
      lo.actions[lo.actions.length - 1].type === "won";
    RL.extractToOverworld();

    // a death right after a win overwrites lastOutcome — it always holds
    // whichever terminal event happened most recently
    RL.profile.atlas.nodes["2,0"] = { state: "frontier", biome: "scrapyard", wreck: 0 };
    RL.fabricateKey(1);
    const kk2 = RL.profile.atlas.keys.filter(k => k.tier === 1 && k.rarity === "normal").pop();
    RL.enterNode(2, 0, kk2.id);
    for (const el of [...RL.run.enemies].filter(x => x.elite)) RL.hurtEnemy(el, 99999);   // records a "won"
    const grunt = RL.spawnEnemy("scrapper", RL.run.player.q + 1, RL.run.player.r);
    RL.run.player.hp = 1;
    RL.hurtPlayer(grunt, 5);   // records a "died" — must overwrite the win above
    lo = RL.persist().lastOutcome;
    out.deathAfterWinOverwrites = lo.kind === "died" && lo.cause === "scrapper";
    out.deathAfterWinActionsSpanBothEvents = Array.isArray(lo.actions) &&
      lo.actions.some(a => a.type === "won") && lo.actions[lo.actions.length - 1].type === "died";

    // the debug bundle surfaces it at the top level too, not just buried
    // inside campaignMeta — same object, read from the same source
    const bundle = RL.buildDebugBundle();
    out.bundleSurfacesLastOutcome = !!bundle.lastOutcome &&
      JSON.stringify(bundle.lastOutcome) === JSON.stringify(bundle.campaignMeta.lastOutcome);

    try {
      localStorage.removeItem("ironhex-foundry");
      localStorage.removeItem("ironhex-run");
      localStorage.removeItem("ironhex");
    } catch (e) {}
    return out;
  });
  for (const [k, v] of Object.entries(r7)) check(k, !!v);

  // ============================ UI wiring ============================
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForTimeout(300);
  const exportBtnVisible = await page.locator("#btn-debug-export").isVisible();
  check("topbarExportButtonVisible", exportBtnVisible);
  const menuExportVisible = await page.locator("#export-debug").isVisible();
  check("menuExportLinkVisible", menuExportVisible);
  const menuImportVisible = await page.locator("#import-debug").isVisible();
  check("menuImportLinkVisible", menuImportVisible);

  // deploy badge: a non-interactive footer note stamped by hand on every
  // push, shown only on the intro/menu page — it lives inside #menu, so
  // it hides automatically the moment the overlay does, with no extra
  // show/hide wiring needed
  const badgeOnMenu = (await page.locator("#deploy-badge").textContent()).trim();
  check("deployBadgeShowsOnMenu", badgeOnMenu.length > 0);
  check("deployBadgeIsNonInteractive", await page.evaluate(() =>
    getComputedStyle(document.getElementById("deploy-badge")).pointerEvents === "none"));
  await page.click("#begin-btn");
  await page.waitForTimeout(300);
  check("deployBadgeHiddenInGame", !(await page.locator("#deploy-badge").isVisible()));

  check("noPageErrors", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 8));
  await browser.close();
  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
