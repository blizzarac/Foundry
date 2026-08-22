/* Foundry-overworld acceptance suite: prologue unlock, node keys, sector
   generation, purge objective, wrecks, key sustain, and persistence.

   Usage:  npm install playwright-core && node tests/atlas-smoke.js
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

  const r1 = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};
    // prologue win unlocks the Foundry and grants starter keys
    RL.startRun(4242);
    RL.winRun();
    out.unlocked = RL.profile && RL.profile.atlas.unlocked;
    out.starterKeys = RL.profile.atlas.keys.filter(k => k.tier === 1).length === 3;
    out.hubAndRing = RL.profile.atlas.nodes["0,0"] &&
      Object.values(RL.profile.atlas.nodes).filter(n => n.state === "frontier").length === 6;

    // enter the overworld with the campaign character
    const soulsAtWin = RL.run.player.souls;
    RL.enterOverworld();
    out.overworldScreen = RL.ui.screen === "overworld";
    out.characterCarried = RL.run.player.souls === soulsAtWin && RL.run.player.items.length > 0;
    out.fullRepair = RL.run.player.hp === RL.run.player.maxHp;

    // socket a T1 key into a ring-1 node
    const frontier = Object.keys(RL.profile.atlas.nodes)
      .filter(k => RL.profile.atlas.nodes[k].state === "frontier");
    const [q, r] = frontier[0].split(",").map(Number);
    out.entered = RL.enterNode(q, r, 1);
    out.keyConsumed = RL.profile.atlas.keys.length === 2;
    out.sectorMode = RL.run.mode === "sector" && RL.ui.screen === "game";
    out.hasEnemies = RL.run.enemies.length > 0;
    out.hasPrimes = RL.run.eliteTotal >= 1 &&
      RL.run.enemies.filter(e => e.elite).length === RL.run.eliteTotal;
    out.noStairs = RL.run.stairs === null;

    // purge: killing every Prime clears the node and reveals neighbors
    const nodesBefore = Object.keys(RL.profile.atlas.nodes).length;
    const keysBefore = RL.profile.atlas.keys.length;
    for (const e of [...RL.run.enemies]) if (e.elite) RL.hurtEnemy(e, 9999);
    const node = RL.profile.atlas.nodes[q + "," + r];
    out.cleared = node.state === "cleared";
    out.neighborsRevealed = Object.keys(RL.profile.atlas.nodes).length > nodesBefore;
    out.keySustain = RL.profile.atlas.keys.length > keysBefore;

    // extraction repairs and returns to the overworld
    RL.extractToOverworld();
    out.extracted = RL.ui.screen === "overworld" && RL.run.mode === "overworld" &&
      RL.run.player.hp === RL.run.player.maxHp;

    // death in a sector leaves the cores as a wreck in the node
    RL.run.player.souls = 500;
    out.fabricated = RL.fabricateKey(1) && RL.run.player.souls === 470;
    const f2 = Object.keys(RL.profile.atlas.nodes)
      .filter(k => RL.profile.atlas.nodes[k].state === "frontier" &&
        RL.profile.atlas.nodes[k].tier === 1)[0];
    const [q2, r2] = f2.split(",").map(Number);
    RL.enterNode(q2, r2, 1);
    RL.run.player.souls = 77;
    RL.hurtPlayer(RL.run.enemies[0], 9999);
    const deadNode = RL.profile.atlas.nodes[f2];
    out.wreckStored = deadNode.wreck === 77 && RL.run.player.souls === 0;
    out.deathOverlay = !document.getElementById("death").classList.contains("hidden") &&
      document.getElementById("death-retry").textContent === "Return to the Bay";

    // revive at the Bay, re-key the node, find the wreck waiting
    RL.enterOverworld();
    RL.run.player.souls = 500;
    RL.fabricateKey(1);
    RL.enterNode(q2, r2, 1);
    out.wreckPlaced = !!RL.run.bloodstain && RL.run.bloodstain.souls === 77;
    RL.extractToOverworld();
    RL.saveProfile();
    return out;
  });
  for (const [k, v] of Object.entries(r1)) check(k, !!v);

  // persistence: a full page reload restores the profile
  await page.reload();
  await page.waitForTimeout(400);
  const r2 = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};
    out.profileRestored = RL.profile && RL.profile.atlas.unlocked;
    out.mapRestored = Object.values(RL.profile.atlas.nodes)
      .filter(n => n.state === "cleared").length === 1;
    out.menuButton = document.getElementById("begin-btn").textContent === "Enter the Foundry";
    RL.enterOverworld();
    out.characterRestored = RL.run.player.items.length > 0 && RL.ui.screen === "overworld";
    // wiping the profile returns the menu to prologue mode
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
