/* Dash acceptance suite: the thruster dash reaches any hex up to
   dashRange away — any direction, any length — crossing bodies and fire
   but never rock, and never rounding a corner. Runs the real game headless.

   Usage:  npm install playwright-core && node tests/dash-smoke.js
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

  const out = await page.evaluate(() => {
    const RL = window.RL;
    const out = {};
    const dist = RL.hexDist;

    // a clean arena: open floor around the player, nothing alive, nothing
    // on the ground — so every result below is pure dash geometry
    function arena() {
      RL.startRun(12345);
      const run = RL.run, p = run.player;
      run.enemies.length = 0;
      run.groundLoot.length = 0;
      run.chests.length = 0;
      run.bloodstain = null;
      for (const [k, t] of run.tiles) {
        const [q, r] = k.split(",").map(Number);
        if (dist(q, r, p.q, p.r) <= 4) t.rock = false;
      }
      p.hp = p.maxHp = 99;
      p.st = p.maxSt = 99;
      RL.updateFov();
      return p;
    }
    const rockAt = (p, dq, dr) => {
      const t = RL.run.tiles.get((p.q + dq) + "," + (p.r + dr));
      if (t) t.rock = true;
      return !!t;
    };
    const listed = (p, dq, dr) => RL.dashTargets()
      .some(([q, r]) => q === p.q + dq && r === p.r + dr);

    // --- the point of the change: a distance-2 hex that is NOT on one of
    // the six axes. The old dash could only ever land on 2*DIRS.
    let p = arena();
    let from = [p.q, p.r];
    out.offAxisTargetable = RL.canDashTo(p.q + 2, p.r - 1);
    out.offAxisListed = listed(p, 2, -1);
    const stBefore = p.st, turnBefore = RL.run.turn;
    out.offAxisDashes = RL.actRoll(2, -1) &&
      p.q === from[0] + 2 && p.r === from[1] - 1;
    out.dashCostsPower = p.st === stBefore - p.rollCost;
    out.dashEndsTurn = RL.run.turn > turnBefore;
    // a dash gets its own cyan streak fx, distinct from the special
    // attacks' teal, so it reads as its own verb rather than a plain walk
    const lastFx = RL.fx[RL.fx.length - 1];
    out.dashSpawnsStreakFx = lastFx && lastFx.type === "dashStreak" && lastFx.color === "79,214,232";

    // --- any length up to the max, so a single-hex hop is legal too
    p = arena(); from = [p.q, p.r];
    out.shortDashes = RL.actRoll(1, 0) && p.q === from[0] + 1 && p.r === from[1];

    // --- and the original axis hop still works
    p = arena(); from = [p.q, p.r];
    out.axisDashes = RL.actRoll(2, 0) && p.q === from[0] + 2 && p.r === from[1];

    // --- on open ground every in-range hex that exists is offered
    p = arena();
    let expected = 0;
    for (let dq = -2; dq <= 2; dq++) {
      for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) {
        if (dq === 0 && dr === 0) continue;
        if (RL.run.tiles.has((p.q + dq) + "," + (p.r + dr))) expected++;
      }
    }
    const targets = RL.dashTargets();
    out.openArenaOffersEveryHex = expected > 0 && targets.length === expected;
    out.moreThanTheSixAxes = targets.length > 6;
    out.allTargetsWithinRange = targets
      .every(([q, r]) => dist(q, r, p.q, p.r) <= p.dashRange);

    // --- range and self are refused
    p = arena();
    out.refusesOutOfRange = !RL.canDashTo(p.q + 3, p.r) && !RL.actRoll(3, 0);
    out.refusesSelf = !RL.canDashTo(p.q, p.r) && !RL.actRoll(0, 0);

    // --- landing rules: never on rock, never on a body
    p = arena();
    out.rockLandingSetup = rockAt(p, 2, 0);
    out.refusesRockLanding = !RL.canDashTo(p.q + 2, p.r) && !listed(p, 2, 0);
    p = arena();
    RL.spawnEnemy("scrapper", p.q + 2, p.r);
    out.refusesOccupiedLanding = !RL.canDashTo(p.q + 2, p.r);

    // --- but a body in the LANE is passed straight through
    p = arena(); from = [p.q, p.r];
    RL.spawnEnemy("scrapper", p.q + 1, p.r);
    out.dashesThroughBodies = RL.canDashTo(p.q + 2, p.r) &&
      RL.actRoll(2, 0) && p.q === from[0] + 2 && p.r === from[1];

    // --- rock in the only lane blocks it
    p = arena();
    rockAt(p, 1, 0);
    out.rockBlocksLane = !RL.canDashTo(p.q + 2, p.r) && !RL.actRoll(2, 0);

    // --- an off-axis target has two lanes: one wall doesn't close it
    p = arena();
    rockAt(p, 1, 0);
    out.altLaneStillOpen = RL.canDashTo(p.q + 2, p.r - 1);
    rockAt(p, 1, -1);
    out.bothLanesWalledBlocks = !RL.canDashTo(p.q + 2, p.r - 1);
    // and it never rounds the corner, even though a longer way around exists
    out.noCornerRounding = RL.dashPath(p.q + 2, p.r - 1) === null;

    // --- power gate
    p = arena();
    p.st = p.rollCost - 1;
    out.refusesWithoutPower = !RL.actRoll(2, 0);

    // --- canDashTo and dashTargets agree across the neighbourhood
    p = arena();
    rockAt(p, 1, 0); rockAt(p, 2, -2); rockAt(p, -1, 1);
    RL.spawnEnemy("scrapper", p.q, p.r + 1);
    const set = new Set(RL.dashTargets().map(([q, r]) => q + "," + r));
    let agree = true;
    for (let dq = -3; dq <= 3; dq++) {
      for (let dr = -3; dr <= 3; dr++) {
        const q = p.q + dq, r = p.r + dr;
        if (RL.canDashTo(q, r) !== set.has(q + "," + r)) agree = false;
      }
    }
    out.targetsMatchPredicate = agree;

    // --- landing-danger classification: the targeting overlay colors dash
    // rings by what happens if you land there, and this is the truth it
    // renders. A due (timer-1) windup covering a landing hex is "now" — the
    // strike resolves in the same endTurn the dash triggers, so landing
    // there is a guaranteed hit. A slower windup or a chained amber preview
    // is "soon". Clear ground is null.
    p = arena();
    {
      const mk = (q, r, extra) => {
        const e = Object.assign({
          type: "scrapper", q, r, hp: 50, maxHp: 50, dmg: 3, elite: false,
          awake: true, state: "idle", windupTimer: 0, windupHexes: [],
          windupNext: null, stagger: 0, rest: 0, dir: 0,
        }, extra);
        RL.run.enemies.push(e);
        return e;
      };
      mk(p.q - 3, p.r, { state: "windup", windupTimer: 1,
        windupHexes: [(p.q + 1) + "," + p.r] });
      mk(p.q + 3, p.r, { type: "mortar", state: "windup", windupTimer: 2,
        windupHexes: [(p.q - 1) + "," + p.r] });
      mk(p.q, p.r + 3, { type: "warden", windupNext: [p.q + "," + (p.r - 1)] });
      out.dangerNowOnDueMark = RL.dashDangerAt(p.q + 1, p.r) === "now";
      out.dangerSoonOnSlowMark = RL.dashDangerAt(p.q - 1, p.r) === "soon";
      out.dangerSoonOnAmberPreview = RL.dashDangerAt(p.q, p.r - 1) === "soon";
      out.dangerNullOnClearGround = RL.dashDangerAt(p.q + 1, p.r - 1) === null;
      // proof of the "now" semantics: dashing onto the due mark takes the
      // hit the moment the dash resolves — this is why the ring is red
      const hp0 = p.hp;
      out.dashOntoNowMarkIsHit = RL.actRoll(1, 0) && p.hp === hp0 - 3;
    }

    // --- a real generated floor still offers dashes from the start tile
    RL.startRun(4242);
    RL.run.player.st = RL.run.player.maxSt;
    out.realFloorOffersTargets = RL.dashTargets().length > 0;
    return out;
  });
  for (const [k, v] of Object.entries(out)) check(k, !!v);

  check("noPageErrors", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 5));
  await browser.close();
  console.log(fails ? "\n" + fails + " FAILURE(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
