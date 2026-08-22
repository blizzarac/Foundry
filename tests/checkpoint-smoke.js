/* Checkpoint acceptance suite: a page refresh must never eat a run.
   Covers prologue and keyed-sector checkpoints, resume fidelity, and
   checkpoint clearing on death/extraction.

   Usage:  npm install playwright-core && node tests/checkpoint-smoke.js
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
  const url = "file://" + path.resolve(__dirname, "..", "index.html");
  await page.goto(url);
  await page.waitForTimeout(400);

  // --- prologue checkpoint: play a few turns, refresh, resume in place
  const before = await page.evaluate(() => {
    const RL = window.RL;
    RL.startRun(999);
    RL.actWait(); RL.actWait(); RL.actWait();
    return { turn: RL.run.turn, floor: RL.run.floor, seed: RL.run.seed,
      hp: RL.run.player.hp, souls: RL.run.player.souls };
  });
  await page.reload();
  await page.waitForTimeout(400);
  const r1 = await page.evaluate(prev => {
    const RL = window.RL;
    const out = {};
    out.menuOffersResume = document.getElementById("begin-btn").textContent === "Resume run";
    out.abandonShown = !document.getElementById("abandon-run").classList.contains("hidden");
    out.resumed = RL.resumeRun();
    out.stateMatches = RL.run.turn === prev.turn && RL.run.floor === prev.floor &&
      RL.run.seed === prev.seed && RL.run.player.hp === prev.hp &&
      RL.run.player.souls === prev.souls && RL.run.mode === "campaign";
    out.screenGame = RL.ui.screen === "game";
    out.playable = RL.actWait() && RL.run.turn === prev.turn + 1;
    // death clears the checkpoint
    const p = RL.run.player;
    const D = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    let e = null;
    for (const [dq, dr] of D) {
      const t = RL.run.tiles.get((p.q + dq) + "," + (p.r + dr));
      if (t && !t.rock) { e = RL.spawnEnemy("scrapper", p.q + dq, p.r + dr); break; }
    }
    RL.hurtPlayer(e, 9999);
    out.deathClears = RL.loadRunCheckpoint() === null;
    return out;
  }, before);
  for (const [k, v] of Object.entries(r1)) check(k, !!v);

  // --- sector checkpoint: enter a keyed sector, refresh, resume; the key
  // must not be consumed twice, and extraction clears the checkpoint
  const sectorBefore = await page.evaluate(() => {
    const RL = window.RL;
    RL.startRun(4242);
    RL.winRun();
    RL.enterOverworld();
    RL.run.player.souls = 9999;
    RL.fabricateKey(2);
    const kk = RL.profile.atlas.keys.find(k => k.tier === 2);
    const fk = Object.keys(RL.profile.atlas.nodes)
      .find(k => RL.profile.atlas.nodes[k].state === "frontier");
    const [q, r] = fk.split(",").map(Number);
    RL.enterNode(q, r, kk.id);
    RL.actWait();
    RL.saveProfile();
    return { node: RL.run.sectorNode, turn: RL.run.turn,
      keys: RL.profile.atlas.keys.length, enemies: RL.run.enemies.length };
  });
  await page.reload();
  await page.waitForTimeout(400);
  const r2 = await page.evaluate(prev => {
    const RL = window.RL;
    const out = {};
    out.sectorResumeOffered = document.getElementById("begin-btn").textContent === "Resume run";
    out.sectorResumed = RL.resumeRun();
    out.sectorMatches = RL.run.mode === "sector" && RL.run.sectorNode === prev.node &&
      RL.run.turn === prev.turn && RL.run.enemies.length === prev.enemies;
    out.keyNotDoubleSpent = RL.profile.atlas.keys.length === prev.keys;
    // purge and extract: checkpoint must be gone afterwards
    for (const e of [...RL.run.enemies]) if (e.elite) RL.hurtEnemy(e, 99999);
    RL.extractToOverworld();
    out.extractClears = RL.loadRunCheckpoint() === null;
    // cleanup
    try { localStorage.removeItem("ironhex-foundry"); localStorage.removeItem("ironhex-run"); } catch (e) {}
    return out;
  }, sectorBefore);
  for (const [k, v] of Object.entries(r2)) check(k, !!v);

  check("noPageErrors", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 5));
  await browser.close();
  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
