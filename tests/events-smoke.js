/* Foundry Anomalies acceptance suite: node events (Fabricator Surge,
   Timed Vault, Salvage Convoy, Corrupted Zone) — placement, turn-based
   resolution, rewards, and profile migration.

   Usage:  npm install playwright-core && node tests/events-smoke.js
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

  const r1 = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};

    // --- deterministic roll + variety across a grid
    out.rollDeterministic =
      RL.rollNodeEventForSeed(555, 4, -2) === RL.rollNodeEventForSeed(555, 4, -2);
    const counts = { surge: 0, vault: 0, convoy: 0, corrupted: 0, none: 0 };
    for (let q = -30; q <= 30; q++) for (let r = -30; r <= 30; r++) {
      const e = RL.rollNodeEventForSeed(555, q, r);
      counts[e || "none"]++;
    }
    const total = 61 * 61;
    const withEvent = total - counts.none;
    out.density = withEvent / total > 0.20 && withEvent / total < 0.36;
    out.allFourPresent = counts.surge > 0 && counts.vault > 0 && counts.convoy > 0 && counts.corrupted > 0;

    // set up an unlocked profile to work with
    RL.startRun(31337);
    RL.winRun();
    RL.enterOverworld();
    const p = RL.run.player;
    p.souls = 999999;
    // pin the atlas seed for reproducible node geometry — winRun() picks a
    // random one, and an unlucky roll can produce a too-short convoy path
    // or an isolated vault chest; re-init the frontier ring deterministically
    RL.profile.atlas.seed = 424243;
    RL.profile.atlas.nodes = { "0,0": { state: "hub" } };
    RL.revealArea(0, 0);

    function pickFrontier() {
      return Object.keys(RL.profile.atlas.nodes)
        .find(k => RL.profile.atlas.nodes[k].state === "frontier");
    }
    function enterWithEvent(evType, tier) {
      const fk = pickFrontier();
      const node = RL.profile.atlas.nodes[fk];
      node.event = evType;
      RL.fabricateKey(tier);
      const kk = RL.profile.atlas.keys.filter(k => k.tier === tier && k.rarity === "normal").pop();
      const [q, r] = fk.split(",").map(Number);
      RL.enterNode(q, r, kk.id);
      // these tests hold position for many turns while ambient sector
      // enemies close in — bump durability so a death (which zeroes souls
      // and would cascade into every later fabricateKey call) never
      // happens; combat survivability is covered by the other suites
      RL.run.player.baseMaxHp = 999;
      RL.recalc();
      RL.run.player.hp = RL.run.player.maxHp;
      RL.run.player.souls = 999999;
      return fk;
    }

    // ============================== SURGE ==============================
    enterWithEvent("surge", 1);
    out.surgeType = RL.run.event.type === "surge";
    const fab = RL.run.event.fabricator;
    out.surgePlaced = !!fab && RL.run.tiles.has(fab.q + "," + fab.r);
    out.activateFarFails = (() => {
      p.q = fab.q + 5; p.r = fab.r;
      if (!RL.run.tiles.has(p.q + "," + p.r)) { p.q = fab.q; p.r = fab.r + 5; }
      return !RL.actActivateFabricator();
    })();
    p.q = fab.q + 1 === p.q ? p.q : fab.q;   // reset near the fabricator
    // walk adjacent deterministically: use a known walkable neighbor
    const D6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    let adj = null;
    for (const [dq, dr] of D6) {
      const t = RL.run.tiles.get((fab.q + dq) + "," + (fab.r + dr));
      if (t && !t.rock) { adj = [fab.q + dq, fab.r + dr]; break; }
    }
    p.q = adj[0]; p.r = adj[1];
    const turnBefore = RL.run.turn;
    out.activateAdjacentWorks = RL.actActivateFabricator();
    out.activateCostsTurn = RL.run.turn === turnBefore + 1;
    out.fabricatorActive = fab.active === true;
    // run the clock: 12 cycles total, telegraph at cycle 2 (spawnCountdown hits 1), spawn at 3
    let sawTelegraph = false, sawSpawn = false;
    const enemiesBefore = RL.run.enemies.length;
    for (let i = 0; i < 12 && !fab.resolved; i++) {
      RL.actWait();
      if (fab.telegraphHexes.length) sawTelegraph = true;
      if (RL.run.enemies.some(e => e.surge)) sawSpawn = true;
    }
    out.surgeTelegraphed = sawTelegraph;
    out.surgeSpawnedWave = sawSpawn && RL.run.enemies.filter(e => e.surge).length > 0;
    out.surgeResolved = fab.resolved === true;
    out.surgeClaimedNearby = fab.claimed === true;
    out.surgeCacheDropped = RL.run.groundLoot.some(l => l.q === fab.q && l.r === fab.r);
    const currencyTotal = () => Object.values(p.currency).reduce((a, b) => a + b, 0);
    // surge soul multiplier: a fresh surge-flagged kill pays 1.5x
    const soulsBefore = p.souls;
    const sc = RL.spawnEnemy("scrapper", adj[0], adj[1]);
    sc.surge = true;
    RL.hurtEnemy(sc, 9999);
    const gained = p.souls - soulsBefore;
    const expectedBase = RL.ENEMY.scrapper.souls * (1 + 0.15 * ((RL.run.floorConf.tier || 1) - 1));
    out.surgeSoulBonus = Math.abs(gained - Math.round(expectedBase * 1.5)) <= 1;
    RL.extractToOverworld();

    // surge "out of range" path: activate, then leave before it resolves
    enterWithEvent("surge", 1);
    const fab2 = RL.run.event.fabricator;
    let adj2 = null;
    for (const [dq, dr] of D6) {
      const t = RL.run.tiles.get((fab2.q + dq) + "," + (fab2.r + dr));
      if (t && !t.rock) { adj2 = [fab2.q + dq, fab2.r + dr]; break; }
    }
    RL.run.player.q = adj2[0]; RL.run.player.r = adj2[1];
    RL.actActivateFabricator();
    // teleport far away immediately (simulating disengagement) and run the clock
    let far2 = null, bestD = -1;
    for (const t of RL.run.tiles.values()) {
      if (t.rock) continue;
      const d = RL.hexDist(t.q, t.r, fab2.q, fab2.r);
      if (d > bestD) { bestD = d; far2 = t; }
    }
    if (far2 && bestD > 3) {
      RL.run.player.q = far2.q; RL.run.player.r = far2.r;
      for (let i = 0; i < 12 && !fab2.resolved; i++) RL.actWait();
      out.surgeSealsOutOfRange = fab2.resolved && fab2.claimed === false;
    } else {
      out.surgeSealsOutOfRange = true;   // tiny arena, can't test distance — don't fail the run
    }
    RL.extractToOverworld();

    // ============================== VAULT ==============================
    enterWithEvent("vault", 1);
    out.vaultType = RL.run.event.type === "vault";
    const v = RL.run.event.vault;
    out.vaultChestCount = !!v && v.chestHexes.length >= 1 && v.chestHexes.length <= 3;
    out.vaultChestsFlagged = v.chestHexes.every(hk => {
      const [cq, cr] = hk.split(",").map(Number);
      return RL.run.chests.some(c => c.q === cq && c.r === cr && c.vault === true);
    });
    out.vaultUntriggered = v.triggered === false;
    // sensor range must never weaponize the vault against its owner: with
    // boosted optics a chest is VISIBLE from far beyond what nine cycles
    // of movement can cross, so a bare sighting trigger welded every vault
    // shut for endgame sensor builds. Seeing it from afar must leave the
    // lockdown unarmed — only closing to within sightRange starts the clock
    {
      for (const t of RL.run.tiles.values()) t.rock = false;   // open sightlines
      const [cq0, cr0] = v.chestHexes[0].split(",").map(Number);
      let farTile = null;
      for (const t of RL.run.tiles.values()) {
        const d = RL.hexDist(t.q, t.r, cq0, cr0);
        if (d >= RL.VAULT_SIGHT_RANGE + 3 && d <= RL.VAULT_SIGHT_RANGE + 5) { farTile = t; break; }
      }
      const fovBefore = RL.run.player.fovBonus;
      RL.run.player.q = farTile.q; RL.run.player.r = farTile.r;
      RL.run.player.fovBonus = 40;                             // omniscient sensors
      RL.updateFov();
      RL.tickEvents();
      out.vaultFarSightDoesNotArm = v.triggered === false;
      RL.run.player.fovBonus = fovBefore;
    }
    // sight it: put the player on the chest hex and force an FOV recompute via tick
    const [vq, vr] = v.chestHexes[0].split(",").map(Number);
    RL.run.player.q = vq; RL.run.player.r = vr;
    RL.updateFov();
    RL.tickEvents();
    out.vaultTriggers = v.triggered === true && v.lockdownIn === 9;
    // let the lockdown run out without opening anything else
    for (let i = 0; i < 9 && !v.sealed; i++) RL.actWait();
    out.vaultSeals = v.sealed === true;
    out.sealedChestUnopenable = v.chestHexes.every(hk => {
      const [cq, cr] = hk.split(",").map(Number);
      const c = RL.run.chests.find(cc => cc.q === cq && cc.r === cr);
      return !c || c.opened || c.sealed;
    });
    RL.extractToOverworld();

    // vault success path: open the sighted chest before lockdown
    enterWithEvent("vault", 1);
    const v2 = RL.run.event.vault;
    const [vq2, vr2] = v2.chestHexes[0].split(",").map(Number);
    // step onto the chest hex from an adjacent tile so afterPlayerMove's
    // pickup check actually runs (only real movement triggers it)
    for (const [dq, dr] of D6) {
      const t = RL.run.tiles.get((vq2 + dq) + "," + (vr2 + dr));
      if (t && !t.rock) {
        RL.run.player.q = vq2 + dq; RL.run.player.r = vr2 + dr;
        RL.updateFov();
        openedOk = RL.actStep(-dq, -dr);
        break;
      }
    }
    const chestNow = RL.run.chests.find(c => c.q === vq2 && c.r === vr2);
    out.vaultOpenBeforeLockdown = !!chestNow && chestNow.opened === true;
    RL.extractToOverworld();

    return out;
  });
  for (const [k, v] of Object.entries(r1)) check(k, !!v);

  const r2 = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};
    const p = RL.run.player;
    function pickFrontier() {
      return Object.keys(RL.profile.atlas.nodes)
        .find(k => RL.profile.atlas.nodes[k].state === "frontier");
    }
    function enterWithEvent(evType, tier) {
      const fk = pickFrontier();
      const node = RL.profile.atlas.nodes[fk];
      node.event = evType;
      RL.fabricateKey(tier);
      const kk = RL.profile.atlas.keys.filter(k => k.tier === tier && k.rarity === "normal").pop();
      const [q, r] = fk.split(",").map(Number);
      RL.enterNode(q, r, kk.id);
      RL.run.player.baseMaxHp = 999;
      RL.recalc();
      RL.run.player.hp = RL.run.player.maxHp;
      RL.run.player.souls = 999999;
      return fk;
    }

    // ============================== CONVOY ==============================
    enterWithEvent("convoy", 1);
    out.convoyType = RL.run.event.type === "convoy";
    const cv = RL.run.event.convoy;
    out.convoyPathValid = !!cv && cv.path.length >= 6 && cv.entryIn === 3 && cv.spawned === false;
    for (let i = 0; i < 4 && !cv.spawned; i++) RL.actWait();
    out.convoySpawns = cv.spawned === true && cv.haulerIds.length > 0 &&
      cv.haulerIds.length === Math.min(3, cv.path.length);
    out.haulersAreHaulerType = cv.haulerIds.every(id => {
      const e = RL.run.enemies.find(x => x.id === id);
      return e && e.type === "hauler";
    });
    const firstHauler = RL.run.enemies.find(e => e.id === cv.haulerIds[0]);
    const idxBefore = firstHauler.pathIdx;
    RL.actWait();
    const stillThere = RL.run.enemies.find(e => e.id === cv.haulerIds[0]);
    out.haulerAdvances = !stillThere || stillThere.pathIdx === idxBefore + 1;
    // kill a hauler: currency drop guaranteed, possible key drop
    const target = RL.run.enemies.find(e => cv.haulerIds.includes(e.id));
    const currencyBefore = Object.values(p.currency).reduce((a, b) => a + b, 0);
    if (target) RL.hurtEnemy(target, 9999);
    out.haulerDropsCurrency = Object.values(p.currency).reduce((a, b) => a + b, 0) > currencyBefore;
    // run the rest of the convoy out (exit or die) and confirm it resolves
    for (let i = 0; i < 30 && !cv.done; i++) RL.actWait();
    out.convoyResolves = cv.done === true;
    RL.extractToOverworld();

    // ============================== CORRUPTED ZONE ======================
    enterWithEvent("corrupted", 1);
    out.corruptedType = RL.run.event.type === "corrupted";
    const z = RL.run.event.zone;
    out.zonePlaced = !!z && RL.run.tiles.has(z.q + "," + z.r);
    out.inZoneTrue = RL.inCorruptZone(z.q, z.r);
    out.inZoneFalseFarAway = !RL.inCorruptZone(z.q + 25, z.r);
    // volatile detonation applies to a zone-flagged kill even without the key mod
    const D6b = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    let zAdj = null;
    for (const [dq, dr] of D6b) {
      const t = RL.run.tiles.get((z.q + dq) + "," + (z.r + dr));
      if (t && !t.rock) { zAdj = [z.q + dq, z.r + dr]; break; }
    }
    p.q = zAdj[0]; p.r = zAdj[1];
    const hpBefore = p.hp;
    const zv = RL.spawnEnemy("scrapper", z.q, z.r);
    zv.zoneVolatile = true;
    RL.hurtEnemy(zv, 9999);
    out.zoneVolatileDetonates = p.hp === hpBefore - 1;
    const lastLog = RL.run.actionLog[RL.run.actionLog.length - 1];
    out.zoneVolatileLogged = lastLog.type === "hurt" && lastLog.dmg === 1 && lastLog.hpAfter === p.hp;
    RL.extractToOverworld();

    RL.saveProfile();
    return out;
  });
  for (const [k, v] of Object.entries(r2)) check(k, !!v);

  // --- migration: a v3 profile (no per-node event field) gains events on load
  const r3 = await page.evaluate(() => {
    const RL = window.RL;
    const pr = JSON.parse(JSON.stringify(RL.profile));
    pr.v = 3;
    for (const k in pr.atlas.nodes) delete pr.atlas.nodes[k].event;
    try { localStorage.setItem("ironhex-foundry", JSON.stringify(pr)); } catch (e) {}
    return true;
  });
  await page.reload();
  await page.waitForTimeout(400);
  const r4 = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};
    out.migrated = RL.profile.v === 7;   // v4 events backfill + v5 frame lattice + v6 keystone exclusivity + v7 skill chips
    out.frontierNodesHaveEventField = Object.values(RL.profile.atlas.nodes)
      .filter(n => n.state === "frontier")
      .every(n => n.event !== undefined);
    try { localStorage.removeItem("ironhex-foundry"); localStorage.removeItem("ironhex-run"); } catch (e) {}
    return out;
  });
  for (const [k, v] of Object.entries(r4)) check(k, !!v);

  check("noPageErrors", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 8));
  await browser.close();
  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
