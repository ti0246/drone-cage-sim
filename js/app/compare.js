/* =============================================================================
   compare.js — the comparison test under the simulation
   比較実験 — 4つの構成を現在のケージで各10回飛行させて比べる

   Same runs as tools/run_benchmark.js, for the cage and objects on screen now.
   The runs are spread over many small time slices so the page stays responsive.
   ============================================================================= */
"use strict";

const SETUPS = [
  { nav: "flow", form: "rl", name: "setupA", note: "setupAs" },        // both patents
  { nav: "flow", form: "spring", name: "setupB", note: "setupBs" },    // 2019 patent only
  { nav: "flow", form: "none", name: "setupC", note: "setupCs" },      // no particle method
  { nav: "direct", form: "rl", name: "setupD", note: "setupDs" },      // no grid method
];
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88, 99, 110];

/** Table columns: [result key, title, unit, +1 = higher is better / −1 = lower is better, format]. */
const COLUMNS = [
  ["success", "colSuccess", "unitSuccess", 1, v => (v * 100).toFixed(0)],
  ["crashes", "colCrash", "unitCrash", -1, v => v.toFixed(1)],
  ["minSeparation", "colSep", "unitSep", 1, v => (v * 100).toFixed(0)],
  ["missionTime", "colTime", "unitTime", -1, v => v.toFixed(1)],
  ["energy", "colEnergy", "unitEnergy", -1, v => (v * 1000).toFixed(1)],
];
let compareResults = null;     // one result per setup, filled while the test runs

/** Average the runs of one setup. Time and energy are averaged over the successful runs only. */
function summariseRuns(runs) {
  const wins = runs.filter(r => r.success), mean = (list, key) => list.reduce((a, r) => a + r[key], 0) / list.length;
  return {
    success: wins.length / runs.length,
    crashes: mean(runs, "crashes"),
    minSeparation: Math.min(...runs.map(r => r.minSeparation)),
    missionTime: wins.length ? mean(wins, "missionTime") : null,
    energy: wins.length ? mean(wins, "energy") : null,
  };
}

function renderComparison() {
  if (!state.scenario) return;
  const { X, Y, Z } = CAGE, running = state.scenario.air.filter(s => s.on).length;
  $("compare-desc").textContent = text("cmpDesc")(state.obstacles.length, running, state.labFan ? text("on") : text("off"),
    state.noise ? text("on") : text("off"), X, Y, Z, state.windCompensation ? text("on") : text("off"));
  $("compare-foot").textContent = text("cmpFoot");

  // best and worst value of each column (time, energy and spacing only among setups with ≥ 80 % success)
  const reliable = r => r && r.success >= 0.8, gated = key => key === "missionTime" || key === "energy" || key === "minSeparation";
  const extremes = {};
  if (compareResults) {
    for (const [key] of COLUMNS) {
      const values = compareResults.filter(r => r && (!gated(key) || reliable(r))).map(r => r[key]).filter(v => v != null && isFinite(v));
      if (values.length > 1) extremes[key] = [Math.min(...values), Math.max(...values)];
    }
  }
  let html = `<thead><tr><th>${text("colSetup")}</th>` + COLUMNS.map(c => `<th>${text(c[1])}<br><small>${text(c[2])}</small></th>`).join("") + "</tr></thead><tbody>";
  SETUPS.forEach((setup, k) => {
    const r = compareResults && compareResults[k];
    html += `<tr class="clickable" data-k="${k}"><td><b>${text(setup.name)}</b><br><span class="note">${text(setup.note)}</span></td>`;
    for (const [key, , , better, format] of COLUMNS) {
      if (!r) { html += "<td>—</td>"; continue; }
      const v = r[key];
      if (v == null || !isFinite(v)) { html += `<td class="worst">—</td>`; continue; }
      if (gated(key) && !reliable(r)) { html += `<td class="note">${format(v)}</td>`; continue; }
      let cls = "";
      const e = extremes[key];
      if (e && e[0] !== e[1]) {
        const best = better > 0 ? e[1] : e[0], worst = better > 0 ? e[0] : e[1];
        cls = v === best ? "best" : v === worst ? "worst" : "";
      }
      html += `<td class="${cls}">${format(v)}</td>`;
    }
    html += "</tr>";
  });
  $("compare-table").innerHTML = html + "</tbody>";
  $("compare-table").querySelectorAll("tr.clickable").forEach(tr => {
    tr.onclick = () => {                     // fly this setup in 3D
      const setup = SETUPS[+tr.dataset.k];
      state.nav = setup.nav; state.form = setup.form;
      setPressed("nav", setup.nav); setPressed("form", setup.form);
      resetFlight();
      $("sim").scrollIntoView({ behavior: "smooth" });
    };
  });
}

function runComparison() {
  const button = $("compare-run");
  button.disabled = true;
  button.textContent = text("cmpRunning");
  compareResults = SETUPS.map(() => null);
  renderComparison();
  const jobs = [];
  SETUPS.forEach((setup, k) => SEEDS.forEach(seed => jobs.push([k, seed])));
  const runs = SETUPS.map(() => []);
  let next = 0;
  (function runOne() {
    if (next >= jobs.length) { button.disabled = false; button.textContent = text("cmpRun"); return; }
    const [k, seed] = jobs[next], setup = SETUPS[k];
    const swarm = new Swarm(state.scenario, state.field, POLICY_TABLE,
      { nav: setup.nav, form: setup.form, labFan: state.labFan, noise: state.noise, windCompensation: state.windCompensation }, seed);
    for (let q = 0; q < TIME.maxSteps && swarm.phase !== "done"; q++) swarm.step();
    runs[k].push(swarm.summary());
    next++;
    $("compare-bar").style.width = (100 * next / jobs.length) + "%";
    if (runs[k].length === SEEDS.length) { compareResults[k] = summariseRuns(runs[k]); renderComparison(); }
    setTimeout(runOne, 0);
  })();
}
$("compare-run").onclick = runComparison;
