#!/usr/bin/env node
/* =============================================================================
   run_benchmark.js — the comparison test for every layout, without a browser
   比較実験をブラウザなしで全配置について実行します（Node.js）

   Usage:   node tools/run_benchmark.js
            node tools/run_benchmark.js --cage 7 3.5 2.4     (length, width, height in m)

   Four setups fly every ready-made layout 10 times with the lab fan off ("calm") and
   10 times with the lab fan and position noise switched on ("fan+noise"). Fans and air
   conditioners that belong to a layout keep blowing in both. These are the same runs as
   the "Run the comparison" button on the page.
   ============================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Load the simulation files exactly as the browser does (plain scripts sharing one global scope).
const SIM_FILES = ["config.js", "util.js", "cage.js", "obstacles.js", "airflow.js", "scenario.js",
                   "flowfield.js", "policy-table.js", "policy.js", "swarm.js"];
for (const name of SIM_FILES) {
  const file = path.join(__dirname, "..", "js", "sim", name);
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

const SETUPS = [
  { name: "A  flow field + learned table (both patents)", nav: "flow", form: "rl" },
  { name: "B  flow field + virtual springs (2019)", nav: "flow", form: "spring" },
  { name: "C  flow field, no interaction", nav: "flow", form: "none" },
  { name: "D  straight line + learned table", nav: "direct", form: "rl" },
];
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88, 99, 110];
const ALTITUDE = 1.0;

/** Fly one setup with every seed and return the summaries. */
function flyAll(scenario, field, setup, windAndNoise) {
  return SEEDS.map(seed => {
    const swarm = new Swarm(scenario, field, POLICY_TABLE,
      { nav: setup.nav, form: setup.form, labFan: windAndNoise, noise: windAndNoise }, seed);
    for (let k = 0; k < TIME.maxSteps && swarm.phase !== "done"; k++) swarm.step();
    return swarm.summary();
  });
}

function main() {
  const cageArg = process.argv.indexOf("--cage");
  if (cageArg > 0) setCageSize(+process.argv[cageArg + 1], +process.argv[cageArg + 2], +process.argv[cageArg + 3]);
  console.log(`Cage ${CAGE.X} × ${CAGE.Y} × ${CAGE.Z} m, flight altitude ${ALTITUDE} m, ${SEEDS.length} runs per cell\n`);

  const totals = SETUPS.map(() => ({ runs: 0, success: 0, crashes: 0, minSep: Infinity, times: [] }));
  const header = "layout      condition   " + SETUPS.map((s, k) => "ABCD"[k].padStart(5)).join("") + "   (success %)";
  console.log(header);
  for (const layout of Object.keys(LAYOUTS)) {
    const obstacles = buildLayout(layout);
    const scenario = buildScenario(obstacles, ALTITUDE);
    const field = solveFlowField(scenario);
    for (const windAndNoise of [false, true]) {
      const cells = SETUPS.map((setup, k) => {
        const runs = flyAll(scenario, field, setup, windAndNoise);
        const wins = runs.filter(r => r.success);
        const t = totals[k];
        t.runs += runs.length;
        t.success += wins.length;
        t.crashes += runs.reduce((sum, r) => sum + r.crashes, 0);
        t.minSep = Math.min(t.minSep, ...runs.map(r => r.minSeparation));
        t.times.push(...wins.map(r => r.missionTime));
        return String(Math.round(100 * wins.length / runs.length)).padStart(5);
      });
      console.log(layout.padEnd(12) + (windAndNoise ? "fan+noise" : "calm").padEnd(12) + cells.join(""));
    }
  }

  console.log("\nsetup                                           success   crashes/run   closest pair   mission time");
  SETUPS.forEach((setup, k) => {
    const t = totals[k];
    const meanTime = t.times.length ? (t.times.reduce((a, b) => a + b, 0) / t.times.length).toFixed(1) + " s" : "—";
    console.log(setup.name.padEnd(48) + (Math.round(100 * t.success / t.runs) + " %").padStart(7) +
      (t.crashes / t.runs).toFixed(2).padStart(14) + ((t.minSep * 100).toFixed(0) + " cm").padStart(15) + meanTime.padStart(15));
  });
}

main();
