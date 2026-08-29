/* Skill chip acceptance suite: the PoE-style found/leveled combat
   subroutines that replaced the counted dart/cell consumables. Covers
   identity/config wiring, chest drops + fuse-to-level, HUD sockets and
   cooldowns, all six chips' combat resolution, and the v6->v7 profile
   migration that converts held darts/cells into chips.

   Usage:  npm install playwright-core && node tests/skills-smoke.js
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

  const out = await page.evaluate(() => {
    const RL = window.RL;
    const CFG = window.IRONHEX_CONFIG;
    const out = {};

    RL.startRun(90909);
    const run = RL.run, p = run.player;
    run.enemies.length = 0;
    p.hp = p.maxHp = 999; p.st = p.maxSt = 999;
    for (const [k, t] of run.tiles) {
      const [q, r] = k.split(",").map(Number);
      if (RL.hexDist(q, r, p.q, p.r) <= 5) t.rock = false;
    }
    RL.updateFov();

    const openHex = (q, r) => {
      const t = run.tiles.get(q + "," + r);
      return !!t && !t.rock && !run.enemies.some(e => e.q === q && e.r === r);
    };
    const DIRS6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const findClearLane = len => {
      for (const [dq, dr] of DIRS6) {
        const hexes = []; let q = p.q, r = p.r, ok = true;
        for (let i = 0; i < len; i++) {
          q += dq; r += dr;
          if (!openHex(q, r)) { ok = false; break; }
          hexes.push([q, r]);
        }
        if (ok) return hexes;
      }
      return null;
    };
    const reset = () => {
      run.enemies.length = 0;
      run.mines = [];
      p.hp = p.maxHp; p.st = p.maxSt; p.ward = 0;
      p.skillCd = {};
    };

    // ---------------------------- identity/config ----------------------------
    out.skillIdsMatchConfig = RL.SKILL_IDS.every(id => !!CFG.skills.defs[id]);
    out.everyDefHasDesc = RL.SKILL_IDS.every(id => typeof RL.SKILL_DEFS[id].desc(1) === "string");
    out.skillStatReadsBaseAndLevel = RL.skillStat("shockDart", "dmg", 1) === CFG.skills.defs.shockDart.base.dmg &&
      RL.skillStat("shockDart", "dmg", 2) === CFG.skills.defs.shockDart.base.dmg + CFG.skills.defs.shockDart.perLevel.dmg;

    // ---------------------------- fresh loadout -------------------------------
    out.freshRunKnowsShockDart = p.skills.levels.shockDart === 1;
    out.freshRunSocketsShockDart = p.skills.slots[0] === "shockDart";
    out.freshRunHasEmptySecondSlot = p.skills.slots[1] === null;

    // ---------------------------- chip pickup: learn --------------------------
    reset();
    p.skills = RL.defaultSkills();   // isolate from the fresh-run baseline above
    p.souls = 0;
    RL.gainChip("magGrapple");
    out.learnGrantsLevel1 = p.skills.levels.magGrapple === 1;
    out.learnAutoSockets = p.skills.slots.includes("magGrapple");

    // ---------------------------- chip pickup: fuse ----------------------------
    RL.gainChip("magGrapple");
    out.fuseIncrementsLevel = p.skills.levels.magGrapple === 2;

    // ---------------------------- chip pickup: max refunds cores --------------
    for (let i = 0; i < 10; i++) RL.gainChip("magGrapple");
    out.levelClampsAtMax = p.skills.levels.magGrapple === CFG.skills.maxLevel;
    const soulsBefore = p.souls;
    RL.gainChip("magGrapple");
    out.maxedDuplicateRefundsCores = p.souls === soulsBefore + CFG.skills.fuseRefundCores;

    // ---------------------------- chest drop wiring ----------------------------
    {
      const rng = (() => { let a = 1; return () => { a = (a * 1103515245 + 12345) >>> 0; return a / 4294967296; }; })();
      let sawChip = false, iters = 0;
      while (!sawChip && iters++ < 500) {
        const c = RL.rollChestContents(rng, 5, false);
        if (c.kind === "chip") { sawChip = true; out.chestChipHasKnownSkill = RL.SKILL_IDS.includes(c.skill); }
      }
      out.chestCanRollChip = sawChip;
    }

    // ============================= SHOCK DART =================================
    reset();
    p.skills = { levels: { shockDart: 1 }, slots: ["shockDart", null] };
    {
      const lane = findClearLane(2);
      const [tdq, tdr] = [lane[0][0] - p.q, lane[0][1] - p.r];
      const target = RL.spawnEnemy("scrapper", lane[0][0], lane[0][1]);
      target.hp = target.maxHp = 50;
      const turn0 = run.turn;
      // a direction with no enemy in it at all — the refusal has to come
      // from finding nothing down the lane, not from clicking short of it
      const emptyDir = DIRS6.find(([dq, dr]) => !(dq === tdq && dr === tdr) && openHex(p.q + dq, p.r + dr));
      out.dartRefusedWithNoTarget = !RL.actSkillShot(0, p.q + emptyDir[0], p.r + emptyDir[1]);
      out.dartHits = RL.actSkillShot(0, lane[0][0], lane[0][1]);
      out.dartDealsConfiguredDamage = 50 - target.hp === RL.skillStat("shockDart", "dmg", 1);
      out.dartEndsTurn = run.turn > turn0;
      // the cast's own endTurn ticks cooldowns once immediately, so the
      // value observable right after a cast is the configured cooldown
      // itself, not cooldown+1 — that's what makes it net N full future
      // actions before the chip is usable again
      out.dartSetsCooldown = p.skillCd.shockDart === CFG.skills.defs.shockDart.cooldown;
      out.dartOnCooldownRefuses = !RL.canUseSkill(0);
    }

    // ============================= POWER CELL =================================
    reset();
    p.skills = { levels: { powerCell: 3 }, slots: ["powerCell", null] };
    {
      p.st = 0; p.hp = 1;
      const ok = RL.actSkillInstant(0);
      out.cellRestoresPower = ok && p.st === RL.skillStat("powerCell", "power", 3);
      out.cellHealsIntegrity = p.hp === 1 + RL.skillStat("powerCell", "heal", 3);
    }

    // ============================= MAG GRAPPLE =================================
    reset();
    p.skills = { levels: { magGrapple: 1 }, slots: ["magGrapple", null] };
    {
      const lane = findClearLane(3);
      const [dq, dr] = [lane[0][0] - p.q, lane[0][1] - p.r];
      const target = RL.spawnEnemy("scrapper", lane[2][0], lane[2][1]);
      target.hp = target.maxHp = 50;
      target.state = "windup"; target.windupTimer = 1; target.windupHexes = [p.q + "," + p.r];
      const ok = RL.actSkillShot(0, lane[2][0], lane[2][1]);
      out.grappleHits = ok && target.hp < 50;
      out.grapplePullsAdjacent = target.q === p.q + dq && target.r === p.r + dr;
      // proof the stagger actually held: the cast's own endTurn resolves
      // this same scrapper's AI phase, and landed adjacent (dist 1) it
      // would normally windup a NEW attack immediately — staying idle
      // with no windup means the stagger consumed that reaction (on top
      // of interrupting the incoming strike it already had queued)
      out.grappleInterruptsWindup = target.state === "idle" && target.windupHexes.length === 0;
    }

    // ============================== ARC MINE ===================================
    reset();
    p.skills = { levels: { arcMine: 1 }, slots: ["arcMine", null] };
    {
      const [dq, dr] = DIRS6.find(([dq, dr]) => openHex(p.q + dq, p.r + dr));
      const mq = p.q + dq, mr = p.r + dr;
      out.mineRefusesFarHex = !RL.actSkillMine(0, mq + dq, mr + dr);
      out.minePlants = RL.actSkillMine(0, mq, mr) && RL.mineAt(mq, mr);
      const victim = RL.spawnEnemy("scrapper", mq, mr);
      victim.hp = victim.maxHp = 50;
      RL.actWait();   // endTurn resolves the mine under whatever stands on it
      out.mineDetonatesUnderEnemy = victim.hp < 50 && !RL.mineAt(mq, mr);
    }

    // ============================= KINETIC WARD =================================
    reset();
    p.skills = { levels: { kineticWard: 1 }, slots: ["kineticWard", null] };
    {
      RL.actSkillInstant(0);
      const ward0 = p.ward;
      out.wardRaised = ward0 === RL.skillStat("kineticWard", "absorb", 1);
      const attacker = RL.spawnEnemy("scrapper", p.q + 1, p.r);
      const hpBefore = p.hp;
      RL.hurtPlayer(attacker, Math.floor(ward0 / 2));
      out.wardSoaksPartial = p.hp === hpBefore && p.ward === ward0 - Math.floor(ward0 / 2);
      RL.hurtPlayer(attacker, ward0);   // more than what's left: ward breaks, overflow lands
      out.wardOverflowsToHp = p.hp < hpBefore;
      out.wardExhausted = p.ward === 0;
    }

    // =============================== EMP BURST ===================================
    reset();
    p.skills = { levels: { empBurst: 1 }, slots: ["empBurst", null] };
    {
      const near = RL.spawnEnemy("scrapper", p.q + 1, p.r);
      near.state = "windup"; near.windupTimer = 1; near.windupHexes = [p.q + "," + p.r];
      const radius = RL.skillStat("empBurst", "radius", 1);
      const farSpot = [...run.tiles.values()].find(t => !t.rock &&
        RL.hexDist(t.q, t.r, p.q, p.r) > radius && RL.hexDist(t.q, t.r, p.q, p.r) <= radius + 2);
      const far = farSpot ? RL.spawnEnemy("scrapper", farSpot.q, farSpot.r) : null;
      RL.actSkillInstant(0);
      out.empInterruptsNearWindup = near.state === "idle" && near.windupHexes.length === 0;
      // same same-turn-tick accounting as the dart's cooldown: the cast's
      // own endTurn decrements every armed stagger once, so the value
      // observable right after is configured-stagger minus one — still
      // strictly positive since empBurst's stagger is 2, proving it landed
      out.empStaggersNear = near.stagger === RL.skillStat("empBurst", "stagger", 1) - 1;
      out.empMissesFarEnemy = !far || far.stagger === 0;
    }

    // ---------------------------- HUD sockets/cooldowns --------------------------
    reset();
    p.skills = { levels: { shockDart: 1, powerCell: 1 }, slots: ["shockDart", "powerCell"] };
    RL.refreshHud();
    out.socket0Visible = !document.getElementById("btn-skill-0").classList.contains("hidden");
    out.socket1Visible = !document.getElementById("btn-skill-1").classList.contains("hidden");
    p.skills.slots[1] = null;
    RL.refreshHud();
    out.emptySocketHidesButton = document.getElementById("btn-skill-1").classList.contains("hidden");
    p.skills.slots[1] = "powerCell";
    p.skillCd.powerCell = 4;
    RL.refreshHud();
    out.cooldownDisablesButton = document.getElementById("btn-skill-1").disabled === true;
    out.cooldownShowsCount = document.getElementById("btn-skill-1").textContent.includes("4");

    // ---------------------------- migration v6 -> v7 -----------------------------
    {
      const oldSave = {
        v: 6,
        character: { baseMaxHp: 12, baseMaxSt: 3, bonusDmg: 0, maxFlask: 3, souls: 100,
          items: [], equip: {}, currency: {}, consumables: { dart: 3, cell: 1 } },
        tree: { pts: 0, nodes: [] },
        atlas: { seed: 1, unlocked: true, tierCap: 1, keys: [], nodes: { "0,0": { state: "hub" } } },
      };
      const migrated = RL.migrateProfile(JSON.parse(JSON.stringify(oldSave)));
      out.migrationGrantsShockDartFromDarts = migrated.character.skills.levels.shockDart === 1;
      out.migrationGrantsPowerCellFromCells = migrated.character.skills.levels.powerCell === 1;
      out.migrationSocketsBoth = migrated.character.skills.slots.includes("shockDart") &&
        migrated.character.skills.slots.includes("powerCell");
      out.migrationRefundsExtraDarts = migrated.character.souls === 100 + 2 * CFG.skills.migrateRefundPerExtra;
      out.migrationDropsConsumables = migrated.character.consumables === undefined;
      out.migrationBumpsToV7 = migrated.v === 7;

      // a save that never held any consumables still gets the baseline chip
      const bareSave = JSON.parse(JSON.stringify(oldSave));
      bareSave.character.consumables = {};
      const migratedBare = RL.migrateProfile(bareSave);
      out.migrationBaselineGrantsShockDart = migratedBare.character.skills.levels.shockDart === 1;
    }

    return out;
  });

  for (const [k, v] of Object.entries(out)) check(k, !!v);
  check("noPageErrors", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 8));
  await browser.close();
  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
