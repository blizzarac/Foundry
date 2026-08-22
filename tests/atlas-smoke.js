/* Foundry-overworld acceptance suite: prologue unlock, tier-free nodes,
   craftable Sector Keys, key-mod sector effects, purge objective, wrecks,
   key sustain, and persistence.

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
    const frontierKeys = () => Object.keys(RL.profile.atlas.nodes)
      .filter(k => RL.profile.atlas.nodes[k].state === "frontier");

    // prologue win unlocks the Foundry and grants starter keys
    RL.startRun(4242);
    RL.winRun();
    out.unlocked = RL.profile && RL.profile.atlas.unlocked;
    out.starterKeys = RL.profile.atlas.keys.filter(k => k.tier === 1 && k.rarity === "normal").length === 3;
    out.hubAndRing = RL.profile.atlas.nodes["0,0"] && frontierKeys().length === 6;
    out.nodesHaveNoTier = frontierKeys().every(k => RL.profile.atlas.nodes[k].tier === undefined);

    RL.enterOverworld();
    out.overworldScreen = RL.ui.screen === "overworld";
    out.fullRepair = RL.run.player.hp === RL.run.player.maxHp;

    // the overworld is a landscape: deterministic terrain with regions
    RL.profile.atlas.seed = 777001;   // pin so every later reveal is reproducible
    out.terrainDeterministic =
      JSON.stringify(RL.worldCell(9, -3)) === JSON.stringify(RL.worldCell(9, -3)) &&
      JSON.stringify(RL.worldCell(-7, 11)) === JSON.stringify(RL.worldCell(-7, 11));
    const kinds = { ridge: 0, channel: 0, field: 0, site: 0 };
    for (let q = -12; q <= 12; q++) for (let r = -12; r <= 12; r++) kinds[RL.worldCell(q, r).kind]++;
    out.terrainVariety = kinds.ridge > 5 && kinds.channel > 5 && kinds.field > 10 && kinds.site > 50;

    // the KEY sets the tier: socket a fabricated T3 key into a ring-1 node
    RL.run.player.souls = 2000;
    RL.fabricateKey(3);
    const k3 = RL.profile.atlas.keys.find(k => k.tier === 3);
    const [q0, r0] = frontierKeys()[0].split(",").map(Number);
    out.anyKeyAnyNode = RL.enterNode(q0, r0, k3.id);
    out.keySetsTier = RL.run.floorConf.tier === 3;
    const grunt = RL.run.enemies.find(e => e.type === "scrapper" && !e.elite);
    out.tierScalesEnemies = grunt && grunt.maxHp === 6 && grunt.dmg === 4; // 4hp*1.5, 3dmg+1
    out.tierScalesElites = RL.run.eliteTotal === 2; // 1 + (tier>=3)
    RL.extractToOverworld(); // abandon: key spent, node stays frontier
    out.abandonKeepsFrontier = RL.profile.atlas.nodes[q0 + "," + r0].state === "frontier";

    // key crafting with the same orbs as gear
    const p = RL.run.player;
    p.currency.transmute = 2; p.currency.aug = 1; p.currency.regal = 1;
    p.currency.exalt = 2; p.currency.chaos = 1; p.currency.alch = 1;
    RL.fabricateKey(2);
    const kc = RL.profile.atlas.keys.find(k => k.tier === 2);
    out.transmuteKey = RL.applyOrbToKey("transmute", kc.id) && kc.rarity === "magic" && kc.affixes.length === 1;
    out.augKey = RL.applyOrbToKey("aug", kc.id) && kc.affixes.length === 2;
    out.regalKey = RL.applyOrbToKey("regal", kc.id) && kc.rarity === "rare" && kc.affixes.length === 3 && !!kc.name;
    out.exaltKey = RL.applyOrbToKey("exalt", kc.id) && kc.affixes.length === 4;
    const before = kc.affixes.map(a => a.mod).join(",");
    out.chaosKey = RL.applyOrbToKey("chaos", kc.id) && kc.affixes.length === 4 &&
      kc.affixes.map(a => a.mod).join(",") !== before;
    out.wrongOrbKeyRefused = !RL.applyOrbToKey("transmute", kc.id);
    out.noDupKeyMods = new Set(kc.affixes.map(a => a.mod)).size === 4;

    // key mods shape the sector: force a known rare key and check effects
    RL.fabricateKey(1);
    const km = RL.profile.atlas.keys.find(k => k.tier === 1 && k.rarity === "normal");
    km.rarity = "rare"; km.name = "Test Directive";
    km.affixes = [{ id: 9001, mod: "primed" }, { id: 9002, mod: "armored" },
                  { id: 9003, mod: "overcharged" }, { id: 9004, mod: "dark" }];
    const [q1, r1q] = frontierKeys()[0].split(",").map(Number);
    const biomeBase = (RL.BIOMES[RL.profile.atlas.nodes[q1 + "," + r1q].biome].chests || 1);
    RL.enterNode(q1, r1q, km.id);
    const f = RL.run.floorConf;
    out.modPrimed = RL.run.eliteTotal === 2; // 1 base at T1 + 1 primed
    const grunts = RL.run.enemies.filter(e => !e.elite);
    out.modArmored = grunts.length > 0 &&
      grunts.every(e => e.maxHp === Math.round(RL.ENEMY[e.type].hp * 1.3));
    out.modOvercharged = grunts.every(e => e.dmg === RL.ENEMY[e.type].dmg + 1);
    out.modDark = f.fovPenalty === 2;
    out.modQuant = Math.abs(f.lootBonus - 0.65) < 1e-9;
    out.modChests = RL.run.chests.length === f.chests && f.chests === biomeBase + 2; // + floor(.65/.25)

    // purge clears the node, records its tier, reveals, sustains keys
    const nodesBefore = Object.keys(RL.profile.atlas.nodes).length;
    const keysBefore = RL.profile.atlas.keys.length;
    for (const e of [...RL.run.enemies]) if (e.elite) RL.hurtEnemy(e, 9999);
    const node1 = RL.profile.atlas.nodes[q1 + "," + r1q];
    out.cleared = node1.state === "cleared" && node1.clearedTier === 1;
    out.neighborsRevealed = Object.keys(RL.profile.atlas.nodes).length > nodesBefore;
    out.keySustain = RL.profile.atlas.keys.length > keysBefore;
    RL.extractToOverworld();

    // volatile: a machine dying next to you costs 1 integrity
    RL.fabricateKey(1);
    const kv = RL.profile.atlas.keys.find(k => k.tier === 1 && k.rarity === "normal");
    kv.rarity = "magic";
    kv.affixes = [{ id: 9005, mod: "volatile" }];
    const [q2, r2q] = frontierKeys()[0].split(",").map(Number);
    RL.enterNode(q2, r2q, kv.id);
    out.volatileConf = RL.run.floorConf.volatile === true;
    const pv = RL.run.player;
    const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    let adj = null;
    for (const [dq, dr] of DIRS) {
      const t = RL.run.tiles.get((pv.q + dq) + "," + (pv.r + dr));
      if (t && !t.rock) { adj = RL.spawnEnemy("scrapper", pv.q + dq, pv.r + dr); break; }
    }
    const hpBefore = pv.hp;
    RL.hurtEnemy(adj, 9999);
    out.volatileBlast = pv.hp === hpBefore - 1;

    // death stores the wreck; re-keying places it back in the sector
    RL.run.player.souls = 77;
    RL.hurtPlayer(RL.run.enemies.find(e => !e.elite) || RL.run.enemies[0], 9999);
    const deadNode = RL.profile.atlas.nodes[q2 + "," + r2q];
    out.wreckStored = deadNode.wreck === 77 && RL.run.player.souls === 0;
    out.deathOverlay = document.getElementById("death-retry").textContent === "Return to the Bay";
    RL.enterOverworld();
    RL.run.player.souls = 500;
    RL.fabricateKey(1);
    const kw = RL.profile.atlas.keys.find(k => k.tier === 1 && k.rarity === "normal");
    RL.enterNode(q2, r2q, kw.id);
    out.wreckPlaced = !!RL.run.bloodstain && RL.run.bloodstain.souls === 77;
    RL.extractToOverworld();

    // purging a cap-tier sector surfaces a SENTINEL gate node
    RL.run.player.souls = 99999;
    RL.fabricateKey(4);
    const k4 = RL.profile.atlas.keys.find(k => k.tier === 4 && k.rarity === "normal");
    const [q3, r3] = frontierKeys()[0].split(",").map(Number);
    RL.enterNode(q3, r3, k4.id);
    for (const e of [...RL.run.enemies]) if (e.elite) RL.hurtEnemy(e, 99999);
    RL.extractToOverworld();
    const gateK = Object.keys(RL.profile.atlas.nodes).find(k => RL.profile.atlas.nodes[k].state === "gate");
    out.gateSpawned = !!gateK && RL.profile.atlas.nodes[gateK].band === 4;

    // the gate only accepts a full band-tier key
    const [gq, gr] = gateK.split(",").map(Number);
    RL.run.player.souls = 99999;
    RL.fabricateKey(1);
    const kLow = RL.profile.atlas.keys.find(k => k.tier === 1 && k.rarity === "normal");
    out.gateRejectsLowKey = !RL.enterNode(gq, gr, kLow.id);
    RL.fabricateKey(4);
    const k4b = RL.profile.atlas.keys.find(k => k.tier === 4 && k.rarity === "normal");
    out.gateEntered = RL.enterNode(gq, gr, k4b.id);
    const boss = RL.run.enemies.find(e => e.type === "sentinel");
    out.gateArena = !!boss && RL.run.floorConf.boss === true && RL.run.enemies.length === 1 &&
      RL.run.stairs === null;

    // donut slam: safe pockets sit INSIDE the marked pattern
    const donut = RL.donutHexes(boss);
    const D = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const pockets = [0, 2, 4].map(i => (boss.q + D[i][0] * 2) + "," + (boss.r + D[i][1] * 2));
    out.donutPockets = pockets.every(k => !donut.includes(k)) && donut.length > 12;

    // alternating sweep: red lanes resolve, amber lanes arm immediately
    boss.awake = true;
    boss.state = "windup"; boss.windupTimer = 1; boss.windupKind = "sweep1";
    boss.windupHexes = RL.laneHexes(boss, [0, 2, 4]);
    boss.windupNext = RL.laneHexes(boss, [1, 3, 5]);
    for (const t of RL.run.tiles.values()) {
      if (!t.rock && RL.hexDist(t.q, t.r, boss.q, boss.r) >= 6) {
        RL.run.player.q = t.q; RL.run.player.r = t.r;
        break;
      }
    }
    RL.endTurn();
    out.sweepChains = boss.state === "windup" && boss.windupKind === "sweep2" &&
      boss.windupHexes.length > 0 && !boss.windupNext;

    // killing the SENTINEL raises the tier cap and grants band keys
    RL.hurtEnemy(boss, 999999);
    out.gateFalls = RL.profile.atlas.tierCap === 8 &&
      RL.profile.atlas.nodes[gateK].state === "cleared";
    out.bandKeys = RL.profile.atlas.keys.filter(k => k.tier === 5).length >= 2;
    RL.run.player.souls = 99999;
    out.fabInNewBand = RL.fabricateKey(7);
    out.fabAboveCapFails = !RL.fabricateKey(9);
    RL.extractToOverworld();

    // reveals respect the landscape: no interactive node on a ridge or
    // channel, and cascaded FIELD ground connects the sectors it opened
    const nn = RL.profile.atlas.nodes;
    out.noNodesOnTerrain = Object.keys(nn).every(k => {
      if (nn[k].state === "hub") return true;
      const [q, r] = k.split(",").map(Number);
      const c = RL.worldCell(q, r);
      return c.kind !== "ridge" && c.kind !== "channel";
    });
    out.fieldsAppear = Object.values(nn).some(n => n.state === "field");
    const D6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    out.fieldsConnect = Object.keys(nn).filter(k => nn[k].state === "field").every(k => {
      const [q, r] = k.split(",").map(Number);
      return D6.some(([dq, dr]) => nn[(q + dq) + "," + (r + dr)]);
    });
    RL.saveProfile();
    return out;
  });
  for (const [k, v] of Object.entries(r1)) check(k, !!v);

  // persistence: a full page reload restores profile, map, keys with mods
  await page.reload();
  await page.waitForTimeout(400);
  const r2 = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};
    out.profileRestored = RL.profile && RL.profile.atlas.unlocked;
    out.mapRestored = Object.values(RL.profile.atlas.nodes)
      .filter(n => n.state === "cleared").length === 3; // T1 sector + T4 sector + gate
    out.tierCapRestored = RL.profile.atlas.tierCap === 8;
    out.moddedKeysRestored = RL.profile.atlas.keys
      .some(k => k.rarity !== "normal" && k.affixes.length > 0);
    out.menuButton = document.getElementById("begin-btn").textContent === "Enter the Foundry";
    RL.enterOverworld();
    out.characterRestored = RL.run.player.items.length > 0 && RL.ui.screen === "overworld";
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
