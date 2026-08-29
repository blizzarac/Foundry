/* Frame lattice acceptance suite: the milestone-paced upgrade tree that
   replaced the shop's flat frame upgrades. Proves points come from purges
   (not cores), allocation respects the graph, stat nodes move recalc,
   every mech notable's combat-code branch actually fires, the lattice
   never applies to a prologue rig, and the v4->v5 migration refunds old
   upgrade ranks and grants retroactive points. Runs the real game
   headless.

   Usage:  npm install playwright-core && node tests/tree-smoke.js
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

    // fresh profile: winning the prologue births the tree empty
    RL.startRun(4242);
    RL.winRun();
    RL.enterOverworld();
    RL.profile.atlas.seed = 777001;
    RL.profile.atlas.nodes = { "0,0": { state: "hub" } };
    RL.revealArea(0, 0);
    const t = RL.treeState();
    out.freshTreeShape = !!t && t.pts === 0 && Array.isArray(t.nodes) && t.nodes.length === 0;

    // a first-time purge pays a lattice point through the real kill path
    RL.run.player.souls = 999999;
    RL.fabricateKey(1);
    const k1 = RL.profile.atlas.keys.find(k => k.tier === 1);
    const fk = Object.keys(RL.profile.atlas.nodes).find(k => RL.profile.atlas.nodes[k].state === "frontier");
    const [fq, fr] = fk.split(",").map(Number);
    RL.enterNode(fq, fr, k1.id);
    for (const e of [...RL.run.enemies].filter(e => e.elite)) RL.hurtEnemy(e, 99999);
    out.purgePaysPoint = RL.treeState().pts === CFG.frameTree.pointsPerPurge;
    RL.extractToOverworld();

    // allocation: no points -> refused; entry node allocatable, chained
    // node locked until its prerequisite is in
    RL.treeState().pts = 0;
    out.allocRefusedBroke = !RL.canAllocateNode("sv1").ok;
    RL.treeState().pts = 10;
    out.chainLockedEarly = !RL.canAllocateNode("svN1").ok;
    const dmgBefore = RL.run.player.dmg;
    out.allocEntry = RL.allocateNode("sv1");
    out.allocSpendsPoint = RL.treeState().pts === 9;
    // sv1 is +1 dmg: recalc must move immediately
    out.statNodeMovesRecalc = RL.run.player.dmg === dmgBefore + 1;
    out.allocTwiceRefused = !RL.allocateNode("sv1");
    RL.allocateNode("sv2");
    out.chainOpensAfterPrereq = RL.canAllocateNode("svN1").ok;

    // refunds: free, but only from the tip of a branch inward
    out.refundInnerRefused = !RL.canRefundNode("sv1").ok;
    out.refundLeafOk = RL.refundNode("sv2");
    out.refundRestoresPoint = RL.treeState().pts === 9;
    RL.allocateNode("sv2");

    // tip clusters: a prism socket hangs off every keystone, and the
    // cluster ring's closing notable opens through EITHER parent facet —
    // while a socketed prism can't be pulled out from under its cluster
    const prisms = RL.TREE_NODES.filter(n => n.kind === "jewel");
    out.prismPerBranch = prisms.length === 3 &&
      prisms.every(n => n.requires.every(rq => RL.TREE_NODE_BY_ID[rq].kind === "keystone"));
    const savedNodes = RL.treeState().nodes.slice();
    RL.treeState().nodes = ["sv1", "sv2", "svN1", "sv3", "sv4", "svN2",
      "sv5", "sv6", "svN3", "sv7", "sv8", "svK", "svJ", "svc2"];
    out.clusterOpensThroughEitherParent = RL.canAllocateNode("svc3").ok;
    out.socketedPrismNotRefundable = !RL.canRefundNode("svJ").ok;
    RL.treeState().nodes = savedNodes;
    RL.recalc();

    // --- mech notables: each gates a real combat-code branch ---
    RL.treeState().pts = 40;   // enough for every chain below — points math was proven above
    RL.allocateNode("svN1");   // Momentum Reclaimer: rear-strike kill vents 2 power
    const p = RL.run.player;
    // stage inside a sector so enemies/kill flow is real
    RL.fabricateKey(1);
    const k1b = RL.profile.atlas.keys.find(k => k.tier === 1);
    const fk2 = Object.keys(RL.profile.atlas.nodes).find(k => RL.profile.atlas.nodes[k].state === "frontier");
    const [gq, gr] = fk2.split(",").map(Number);
    RL.enterNode(gq, gr, k1b.id);
    const victim = RL.spawnEnemy("scrapper", p.q + 3, p.r);
    victim.hp = 1;
    p.st = 0;
    RL.hurtEnemy(victim, 5, "backstab");
    out.bsKillRefundVents = p.st === RL.TREE_NODE_BY_ID.svN1.mech.power;
    // a non-rear kill vents nothing
    const victim2 = RL.spawnEnemy("scrapper", p.q + 3, p.r - 1);
    victim2.hp = 1;
    p.st = 0;
    RL.hurtEnemy(victim2, 5, null);
    out.frontKillVentsNothing = p.st === 0;

    // Executioner Logic: +1 vs overloaded, folded in before the riposte double
    for (const id of ["sv3", "sv4", "svN2"]) RL.allocateNode(id);
    RL.recalc();
    const fat = RL.spawnEnemy("scrapper", p.q + 1, p.r);
    fat.hp = fat.maxHp = 9999;
    fat.stagger = 2;
    fat.dir = 0;
    const hpBefore = fat.hp;
    RL.strikeOne(fat, false);   // non-primary: no rear bonus in the arithmetic
    const dealt = hpBefore - fat.hp;
    out.staggerBonusFolded = dealt === (p.dmg + RL.TREE_NODE_BY_ID.svN2.mech.power) * 2;

    // Reactive Plating: a successful deflect vents power back
    for (const id of ["ch1", "ch2", "chN1"]) RL.allocateNode(id);
    RL.recalc();
    p.parry = true;
    p.st = 0;
    const striker = RL.spawnEnemy("scrapper", p.q, p.r + 1);
    const hpBeforeParry = p.hp;
    RL.hurtPlayer(striker, 5);
    out.parryRefundVents = p.hp === hpBeforeParry && p.st === RL.TREE_NODE_BY_ID.chN1.mech.power;
    // ...but a DISTANT attacker still gets through: Aegis not yet installed
    p.parry = true;
    const sniper = RL.spawnEnemy("railer", p.q + 4, p.r);
    RL.hurtPlayer(sniper, 3);
    out.distantHitsWithoutAegis = p.hp === hpBeforeParry - 3;
    p.hp = p.maxHp;

    // Aegis Long-Field: the deflector now catches strikes at any range
    for (const id of ["ch3", "ch4", "chN2"]) RL.allocateNode(id);
    RL.recalc();
    p.parry = true;
    const hpBeforeAegis = p.hp;
    RL.hurtPlayer(sniper, 3);
    out.aegisCatchesRanged = p.hp === hpBeforeAegis && sniper.stagger > 0;

    // Salvage Rites: a Prime kill pays one extra orb
    const orbCount = () => Object.values(p.currency).reduce((a, b) => a + b, 0);
    const elite1 = RL.spawnEnemy("scrapper", p.q + 3, p.r + 1);
    elite1.elite = true;
    const orbsBefore = orbCount();
    RL.hurtEnemy(elite1, 99999);
    const baselineOrbs = orbCount() - orbsBefore;
    for (const id of ["sy1", "sy2", "syN1"]) RL.allocateNode(id);
    RL.recalc();
    const elite2 = RL.spawnEnemy("scrapper", p.q + 3, p.r + 2);
    elite2.elite = true;
    const orbsBefore2 = orbCount();
    RL.hurtEnemy(elite2, 99999);
    out.salvageRitesExtraOrb = orbCount() - orbsBefore2 ===
      baselineOrbs + RL.TREE_NODE_BY_ID.syN1.mech.power;

    // Deep-Cycle Scanners: drops roll deeper tier bands than the sector.
    // At depth 2 the bands cap affixes at tier 2; +2 depth reaches tier 3.
    const mk = (() => { let a = 7; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    const maxTierRolled = () => {
      let top = 0;
      for (let i = 0; i < 400; i++) {
        const it = RL.rollItemLoot(mk, 2, true);
        for (const a of it.affixes) top = Math.max(top, a.tier || 0);
      }
      return top;
    };
    const topWithout = maxTierRolled();
    for (const id of ["sy3", "sy4", "syN2"]) RL.allocateNode(id);
    RL.recalc();
    const topWith = maxTierRolled();
    out.scannersDeepenLoot = topWithout <= 2 && topWith >= 3;

    // --- root specials: mutually exclusive at the root (no prerequisite,
    // available from the very first point), and each attack's real
    // damage/movement/cost resolution ---
    try {
    out.specialsExclusiveAtRoot = (() => {
      RL.allocateNode("spSlam");
      const blocked = !RL.canAllocateNode("spCharge").ok;
      const refunded = RL.refundNode("spSlam");
      const nowOpen = RL.canAllocateNode("spCharge").ok;
      return blocked && refunded && nowOpen;
    })();

    RL.fabricateKey(1);
    const kSp = RL.profile.atlas.keys.find(k => k.tier === 1);
    const fkSp = Object.keys(RL.profile.atlas.nodes).find(k => RL.profile.atlas.nodes[k].state === "frontier");
    const [spq, spr] = fkSp.split(",").map(Number);
    RL.enterNode(spq, spr, kSp.id);
    RL.run.enemies.length = 0;   // a clean floor: only the test's own placements matter here
    const spCost = CFG.combat.special.cost;
    const SP_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const openHex = (q, r) => {
      const t = RL.run.tiles.get(q + "," + r);
      return !!t && !t.rock && !RL.run.enemies.some(e => e.q === q && e.r === r);
    };
    // a real sector's terrain, not a guess: find a direction with at
    // least `len` genuinely open (non-rock, unoccupied) hexes ahead
    const findClearLane = len => {
      for (const [dq, dr] of SP_DIRS) {
        const hexes = [];
        let q = p.q, r = p.r, ok = true;
        for (let i = 0; i < len; i++) {
          q += dq; r += dr;
          if (!openHex(q, r)) { ok = false; break; }
          hexes.push([q, r]);
        }
        if (ok) return hexes;
      }
      return null;
    };

    // Overload Slam: hits and staggers every adjacent machine, misses one
    // two rings out, and never moves the player
    RL.allocateNode("spSlam");
    RL.recalc();
    RL.refreshHud();
    out.slamSelectedSetsSpecialAttack = p.specialAttack === "slam";
    out.specialBtnShowsLabel = !document.getElementById("btn-special").classList.contains("hidden") &&
      document.getElementById("btn-special").textContent === "Overload Slam";
    const slamLane = findClearLane(2);   // [0]=ring1 (adjacent), [1]=ring2 (control, should miss)
    const slamAdj1 = RL.spawnEnemy("scrapper", slamLane[0][0], slamLane[0][1]);
    slamAdj1.hp = slamAdj1.maxHp = 9999;   // survives the hit so stagger is observable
    const otherDir = SP_DIRS.find(([dq, dr]) => openHex(p.q - dq, p.r - dr));
    const slamAdj2 = RL.spawnEnemy("scrapper", p.q - otherDir[0], p.r - otherDir[1]);
    slamAdj2.hp = slamAdj2.maxHp = 9999;
    const slamFar = RL.spawnEnemy("scrapper", slamLane[1][0], slamLane[1][1]);
    const [pqBeforeSlam, prBeforeSlam] = [p.q, p.r];
    p.st = 0;
    out.slamRefusedWithoutPower = !RL.actSlam();
    p.st = spCost;
    RL.actSlam();
    out.slamHitsBothAdjacent = slamAdj1.hp < slamAdj1.maxHp && slamAdj2.hp < slamAdj2.maxHp;
    out.slamStaggersAdjacent = slamAdj1.stagger > 0 && slamAdj2.stagger > 0;
    out.slamMissesRing2 = slamFar.hp === slamFar.maxHp;
    out.slamDoesNotMovePlayer = p.q === pqBeforeSlam && p.r === prBeforeSlam;
    out.slamSpendsCost = p.st === 0;
    out.slamSpawnsRingFx = RL.fx[RL.fx.length - 1] && RL.fx[RL.fx.length - 1].type === "slamRing";
    p.st = spCost;
    out.wrongSpecialModeRefused = !RL.actCharge(slamLane[0][0], slamLane[0][1]);   // specialAttack is "slam"
    RL.refundNode("spSlam");
    RL.recalc();

    // Rail Charge: damages everything on a straight lane and lands on the
    // far (open) hex clicked, not just the nearest one
    RL.allocateNode("spCharge");
    RL.recalc();
    out.chargeSelectedSetsSpecialAttack = p.specialAttack === "charge";
    RL.run.enemies.length = 0;   // clear the slam test's leftovers before hunting a lane
    const chargeLane = findClearLane(3);
    const chargeNear = RL.spawnEnemy("scrapper", chargeLane[0][0], chargeLane[0][1]);
    const chargeFar = RL.spawnEnemy("scrapper", chargeLane[1][0], chargeLane[1][1]);
    const landing = chargeLane[2];
    out.chargeTargetsOffersLanding =
      RL.chargeTargets().some(([q, r]) => q === landing[0] && r === landing[1]);
    p.st = spCost;
    RL.actCharge(landing[0], landing[1]);
    out.chargeHitsBothInLane = chargeNear.hp < chargeNear.maxHp && chargeFar.hp < chargeFar.maxHp;
    out.chargeMovesPlayerToLanding = p.q === landing[0] && p.r === landing[1];
    out.chargeSpendsCost = p.st === 0;
    out.chargeSpawnsStreakFx = RL.fx[RL.fx.length - 1] && RL.fx[RL.fx.length - 1].type === "chargeStreak";
    RL.refundNode("spCharge");
    RL.recalc();

    // Barrage Volley: same lane damage, but the player holds position
    RL.allocateNode("spBarrage");
    RL.recalc();
    out.barrageSelectedSetsSpecialAttack = p.specialAttack === "barrage";
    RL.run.enemies.length = 0;   // clear the charge test's leftovers before hunting a lane
    const barrageLane = findClearLane(2);
    const barrageNear = RL.spawnEnemy("scrapper", barrageLane[0][0], barrageLane[0][1]);
    const barrageFar = RL.spawnEnemy("scrapper", barrageLane[1][0], barrageLane[1][1]);
    const [pqBeforeBarrage, prBeforeBarrage] = [p.q, p.r];
    p.st = spCost;
    RL.actBarrage(barrageLane[0][0], barrageLane[0][1]);
    out.barrageHitsBothInLane = barrageNear.hp < barrageNear.maxHp && barrageFar.hp < barrageFar.maxHp;
    out.barrageDoesNotMovePlayer = p.q === pqBeforeBarrage && p.r === prBeforeBarrage;
    out.barrageSpendsCost = p.st === 0;
    out.barrageSpawnsBeamFx = RL.fx[RL.fx.length - 1] && RL.fx[RL.fx.length - 1].type === "barrageBeam";
    RL.refundNode("spBarrage");
    RL.recalc();
    RL.refreshHud();
    out.specialBtnHidesAfterRefundingAll =
      document.getElementById("btn-special").classList.contains("hidden");
    out.specialAttackClearedAfterRefundAll = !p.specialAttack;
    } catch (e) { out.__specialErr = e.message + "\n" + e.stack; }

    RL.extractToOverworld();

    // the lattice never applies to a prologue rig: same profile, fresh
    // campaign run — every mech flag zeroed, no stat bleed
    const owDmgNodes = RL.treeState().nodes.length;
    RL.startRun(555);
    const pc = RL.run.player;
    out.prologueIgnoresTree = owDmgNodes > 0 &&
      Object.values(pc.treeMech).every(v => v === 0);

    // --- migration: v4 saves refund upgrade cores and earn retro points ---
    const hpU = CFG.economy.upgrades.find(u => u.id === "hp");
    const dmgU = CFG.economy.upgrades.find(u => u.id === "dmg");
    const oldSave = {
      v: 4,
      character: {
        baseMaxHp: 40 + hpU.delta.baseMaxHp * 2, baseMaxSt: 10, bonusDmg: 1,
        maxFlask: 3, souls: 100, items: [], equip: {}, currency: {}, consumables: {},
        upgrades: { hp: 2, dmg: 1 },
      },
      atlas: { seed: 1, unlocked: true, tierCap: 4, keys: [],
        nodes: {
          "0,0": { state: "hub" },
          "1,0": { state: "cleared", clearedTier: 1 },
          "2,0": { state: "cleared", clearedTier: 2 },
          "3,0": { state: "cleared", clearedTier: 4, band: 4 },   // a fallen gate
          "4,0": { state: "frontier", event: null },
        } },
    };
    const migrated = RL.migrateProfile(JSON.parse(JSON.stringify(oldSave)));
    const expectedRefund = Math.round(hpU.base) + Math.round(hpU.base * 2) + Math.round(dmgU.base);
    out.migrationRefundsCores = migrated.character.souls === 100 + expectedRefund;
    out.migrationStripsStats = migrated.character.baseMaxHp === 40 &&
      migrated.character.bonusDmg === 0;
    out.migrationDropsRanks = migrated.character.upgrades === undefined;
    out.migrationGrantsRetroPoints = migrated.tree &&
      migrated.tree.pts === 2 * CFG.frameTree.pointsPerPurge + CFG.frameTree.pointsPerGate;
    out.migrationBumpsVersion = migrated.v === 7;
    // an already-current profile is left alone
    const fresh = RL.migrateProfile(JSON.parse(JSON.stringify(migrated)));
    out.migrationIdempotent = fresh.character.souls === migrated.character.souls &&
      fresh.tree.pts === migrated.tree.pts;

    // --- migration: v5 saves with multiple keystones keep one, cascade-
    // strip the other keystones' now-orphaned jewel/facets/notable, and
    // refund a point per stripped node ---
    const v5Save = {
      v: 5,
      character: { baseMaxHp: 12, baseMaxSt: 3, bonusDmg: 0, maxFlask: 3, souls: 0,
        items: [], equip: {}, currency: {}, consumables: {} },
      atlas: { seed: 1, unlocked: true, tierCap: 12, keys: [], nodes: { "0,0": { state: "hub" } } },
      tree: {
        pts: 3,
        // chK's full cluster, svK bare, syK's full cluster — three
        // keystones at once, exactly the pre-tightening real-world case
        nodes: [
          "ch1", "ch2", "chN1", "ch3", "ch4", "chN2", "ch5", "ch6", "chN3", "ch7", "ch8",
          "chK", "chJ", "chc1", "chc2", "chc3",
          "sv1", "sv2", "svN1", "sv3", "sv4", "svN2", "sv5", "sv6", "svN3", "sv7", "sv8", "svK",
          "sy1", "sy2", "syN1", "sy3", "sy4", "syN2", "sy5", "sy6", "syN3", "sy7", "sy8",
          "syK", "syJ", "syc1", "syc2", "syc3",
        ],
      },
    };
    const beforeCount = v5Save.tree.nodes.length;
    const migrated6 = RL.migrateProfile(JSON.parse(JSON.stringify(v5Save)));
    const keptKeystones = migrated6.tree.nodes.filter(id => RL.TREE_NODE_BY_ID[id].kind === "keystone");
    out.migrationKeepsOneKeystone = keptKeystones.length === 1 && keptKeystones[0] === "chK";
    // chK's cluster (chJ/chc1/chc2/chc3) survives since chK is the one kept
    out.migrationKeepsKeptClusterIntact = ["chJ", "chc1", "chc2", "chc3"].every(id => migrated6.tree.nodes.includes(id));
    // svK had no cluster installed (bare keystone) -> just itself removed;
    // syK's full cluster (syJ + 2 facets + notable) is orphaned and removed too
    out.migrationStripsOrphanedClusters = !migrated6.tree.nodes.includes("svK") &&
      !["syK", "syJ", "syc1", "syc2", "syc3"].some(id => migrated6.tree.nodes.includes(id));
    // exactly 6 nodes stripped (svK, syK, syJ, syc1, syc2, syc3) -> 6 points refunded
    const removedCount = beforeCount - migrated6.tree.nodes.length;
    out.migrationRefundsStrippedPoints = removedCount === 6 &&
      migrated6.tree.pts === v5Save.tree.pts + 6;
    out.migrationV5ToV6BumpsVersion = migrated6.v === 7;

    // --- the exclusivity rule itself: a second keystone is refused live ---
    // both branches' pre-keystone chains installed, so svK's ONLY blocker
    // once chK is taken is the exclusivity rule, not a missing prerequisite
    RL.profile.tree = {
      pts: 5,
      nodes: [
        "ch1", "ch2", "chN1", "ch3", "ch4", "chN2", "ch5", "ch6", "chN3", "ch7", "ch8",
        "sv1", "sv2", "svN1", "sv3", "sv4", "svN2", "sv5", "sv6", "svN3", "sv7", "sv8",
      ],
    };
    out.firstKeystoneAllocates = RL.allocateNode("chK");
    out.secondKeystoneRefused = !RL.canAllocateNode("svK").ok;
    // stripping the first keystone (after clearing its dependents, since
    // refund is tip-inward) reopens the slot for a different one
    out.secondKeystoneOpensAfterRefund = RL.refundNode("chK") && RL.canAllocateNode("svK").ok;

    try { localStorage.removeItem("ironhex-foundry"); localStorage.removeItem("ironhex-run"); } catch (e) {}
    return out;
  });
  if (r.__specialErr) console.log("SPECIAL ERR:", r.__specialErr);
  for (const [k, v] of Object.entries(r)) check(k, !!v);

  // --- UI: the lattice overlay renders the full graph and allocates on tap ---
  await page.reload();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const RL = window.RL;
    RL.startRun(999);
    RL.winRun();
    RL.enterOverworld();
    // the game's beforeunload hook re-saved the part-1 profile past our
    // cleanup, so the reload may resurrect its allocations — reset to a
    // known state rather than assuming a virgin tree
    RL.profile.tree = { pts: 3, nodes: [] };
    RL.recalc();
    RL.showTree();
  });
  check("treeRendersAllNodes", await page.evaluate(() =>
    document.querySelectorAll("#tree-graph .tree-node").length === window.RL.TREE_NODES.length));
  // one edge per require-link plus a hub spoke per branch entry
  check("treeEdgesDrawn", await page.evaluate(() => {
    const RL = window.RL;
    const expected = RL.TREE_NODES.reduce((a, n) => a + Math.max(1, n.requires.length), 0);
    return document.querySelectorAll("#tree-graph .tree-edge").length === expected;
  }));
  // 3 branch entries (ch1/sv1/sy1) + 3 root specials (spSlam/spCharge/spBarrage)
  check("entryNodesAvailable", await page.evaluate(() =>
    document.querySelectorAll("#tree-graph .tree-node.avail").length === 6));
  // tap an entry node, then its Install button in the detail bar (SVG
  // groups have no HTMLElement.click, so dispatch a real click event)
  await page.evaluate(() => {
    [...document.querySelectorAll("#tree-graph .tree-node.avail")][0]
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  check("detailShowsInstall", await page.evaluate(() =>
    !document.getElementById("tree-detail").classList.contains("hidden") &&
    document.querySelector("#tree-detail button").textContent.includes("Install")));
  await page.click("#tree-detail button");
  check("tapInstallAllocates", await page.evaluate(() =>
    document.querySelectorAll("#tree-graph .tree-node.allocated").length === 1 &&
    window.RL.treeState().pts === 2));
  // the shop's Frame section is now the lattice row, not upgrade buttons
  await page.evaluate(() => { document.getElementById("tree-close").click(); window.RL.showShop(); });
  check("shopSellsNoFlatUpgrades", await page.evaluate(() => {
    const items = [...document.querySelectorAll("#shop-items .shop-item")];
    return !items.some(b => b.textContent.includes("Chassis reinforcement")) &&
      items.some(b => b.textContent.includes("Frame lattice"));
  }));
  await page.evaluate(() => {
    try { localStorage.removeItem("ironhex-foundry"); localStorage.removeItem("ironhex-run"); } catch (e) {}
  });

  check("noPageErrors", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 5));
  await browser.close();
  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
