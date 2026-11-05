/* =============================================================================
   panels.js — the right panel and the chips on the 3D view: mission phase, live numbers,
               each drone, two charts, and the event log
   右パネル — ミッション段階、リアルタイム計測、各機の状態、グラフ、イベントログ
   ============================================================================= */
"use strict";

/** Short message in the middle of the 3D view (empty text hides it). */
function toast(message) {
  const t = $("toast");
  if (!message) { t.hidden = true; return; }
  t.textContent = message;
  t.hidden = false;
}

/** Add a line at the top of the event log. cls: "e-ok" (green), "e-bad" (red), "e-info" (blue). */
function logEvent(html, cls) {
  const line = document.createElement("div"), log = $("log");
  line.className = cls || "";
  line.innerHTML = html;
  log.prepend(line);
  while (log.children.length > 60) log.lastChild.remove();
}

/** Write the new events of the flight into the log, with a red flash for every crash. */
let shownEvents = 0, doneLogged = false;
function showNewEvents() {
  const swarm = state.swarm;
  for (; shownEvents < swarm.events.length; shownEvents++) {
    const e = swarm.events[shownEvents], t = e.t.toFixed(1);
    if (e.type === "dd") { logEvent(text("evCollide")(t, e.i + 1, e.j + 1), "e-bad"); flashAt(e.i); }
    else if (e.type === "obs") { logEvent(text("evObstacle")(t, e.i + 1), "e-bad"); flashAt(e.i); }
    else if (e.type === "net") { logEvent(text("evNet")(t, e.i + 1), "e-bad"); flashAt(e.i); }
    else if (e.type === "floor") { logEvent(text("evFloor")(t, e.i + 1), "e-bad"); flashAt(e.i); }
    else if (e.type === "arr") logEvent(text("evArrive")(t, e.i + 1), "e-ok");
    else if (e.type === "land") logEvent(text("evLand")(t, e.i + 1), "e-ok");
  }
  if (swarm.phase === "done" && !doneLogged) {
    doneLogged = true;
    logEvent(text("evDone")(swarm.doneAt.toFixed(1)), "e-ok");
  }
}
function resetEventLog() {
  shownEvents = 0;
  doneLogged = false;
  $("log").innerHTML = "";
}

/* ---------------------------------------------------------------- one card per drone */

function buildDroneCards() {
  $("drones").innerHTML = [0, 1, 2].map(i =>
    `<div class="cf"><div class="id"><i style="background:${DRONE_CSS[i]}"></i>CF${i + 1}</div><div></div><span class="st" id="cf-state-${i}">—</span>` +
    `<div class="xyz" id="cf-xyz-${i}"></div>` +
    `<div class="bat"><span>${text("battery")}</span><span class="bar"><i id="cf-bat-${i}" style="width:100%"></i></span><span id="cf-batv-${i}">100%</span></div></div>`).join("");
}

/** Label and colour of the state of drone i. */
function droneStatus(i) {
  const s = state.swarm;
  if (s.state[i] === STATE.CRASHED) return [text("stDead"), "bad"];
  if (s.state[i] === STATE.LANDED) return [text("stLanded"), "ok"];
  if (s.pz[i] < 0.05) return [text("stPad"), ""];
  if (s.arrived[i]) return [text("stArr"), "ok"];
  return [text("stFly"), "run"];
}

/* ---------------------------------------------------------------- live numbers (about 10 times per second) */

function updateHUD() {
  const s = state.swarm;
  if (!s) return;
  $("hud-time").textContent = s.t.toFixed(1) + " s";
  const crashes = s.droneCollisions + s.obstacleCrashes, status = $("hud-status");
  const phaseNames = { takeoff: text("phTakeoff"), transit: text("phTransit"), land: text("phLand"), done: text("phDone") };
  status.textContent = state.running || s.phase === "done" ? phaseNames[s.phase] : text("pause");
  status.className = "chip status " + (s.phase === "done" ? (crashes ? "bad" : "ok") : "run");
  $("hud-mode").textContent = (state.nav === "flow" ? text("navFlow") : text("navDirect")) + " · " +
    (state.form === "rl" ? text("formRL") : state.form === "spring" ? text("formSpring") : text("formNone"));
  const current = ["takeoff", "transit", "land", "done"].indexOf(s.phase);
  document.querySelectorAll("#phasebar span").forEach((el, k) => { el.className = k === current ? "on" : k < current ? "past" : ""; });

  const landed = s.landedCount || 0;
  $("val-land").innerHTML = `${landed}<small>/3</small>`;
  $("tile-land").className = "tile" + (landed === 3 ? " good" : "");
  $("val-crash").textContent = crashes;
  $("tile-crash").className = "tile " + (crashes ? "bad" : "good");
  $("val-obs").textContent = state.obstacles.length;
  const sep = s.minSeparation, flying = s.phase !== "takeoff";
  $("val-sep").innerHTML = (isFinite(sep) && flying ? Math.round(sep * 100) : "—") + "<small>cm</small>";
  $("tile-sep").className = "tile " + (!isFinite(sep) || !flying ? "" : sep < 0.18 ? "bad" : sep < 0.3 ? "warn" : "good");

  for (let i = 0; i < 3; i++) {
    const [label, cls] = droneStatus(i), el = $("cf-state-" + i);
    el.textContent = label;
    el.className = "st " + cls;
    const v = Math.hypot(s.vx[i], s.vy[i], s.vz[i]);
    $("cf-xyz-" + i).innerHTML = `x <b>${s.px[i].toFixed(2)}</b> y <b>${s.py[i].toFixed(2)}</b> z <b>${s.pz[i].toFixed(2)}</b> · v <b>${v.toFixed(2)}</b>`;
    const battery = Math.max(0, 100 - s.energy[i] / DRONE.batteryWh * 100);
    $("cf-bat-" + i).style.width = battery.toFixed(1) + "%";
    $("cf-batv-" + i).textContent = battery.toFixed(1) + "%";
  }
  drawCharts();
}

/* ---------------------------------------------------------------- charts */

/** Size a chart canvas for the screen and return [context, width, height] in CSS pixels. */
function prepareCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(10, Math.round(r.width * dpr)), H = Math.max(10, Math.round(r.height * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, r.width, r.height);
  return [g, r.width, r.height];
}

function drawCharts() {
  const h = state.swarm.history, tmax = Math.max(30, Math.ceil((h.t[h.t.length - 1] || 0) / 10) * 10), tStep = tmax > 40 ? 20 : 10;
  const axisStyle = g => { g.font = "10px JetBrains Mono, monospace"; g.fillStyle = "#5d7682"; g.strokeStyle = "#1d2b33"; g.lineWidth = 1; };

  { // closest distance between two drones, cm (dashed: 50 cm target, red: 12 cm collision)
    const [g, W, H] = prepareCanvas($("chart-sep")), pl = 28, pr = 8, pt = 8, pb = 18, ymax = 100;
    const X = t => pl + (W - pl - pr) * t / tmax, Y = v => pt + (H - pt - pb) * (1 - Math.min(v, ymax) / ymax);
    axisStyle(g);
    [0, 25, 50, 75, 100].forEach(v => { g.beginPath(); g.moveTo(pl, Y(v)); g.lineTo(W - pr, Y(v)); g.stroke(); g.fillText(v, 4, Y(v) + 3); });
    for (let t = 0; t <= tmax; t += tStep) g.fillText(t + "s", X(t) - 8, H - 4);
    g.setLineDash([4, 3]);
    g.strokeStyle = "#3a4b58"; g.beginPath(); g.moveTo(pl, Y(50)); g.lineTo(W - pr, Y(50)); g.stroke();
    g.strokeStyle = "#ff5a5f"; g.beginPath(); g.moveTo(pl, Y(12)); g.lineTo(W - pr, Y(12)); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = "#4fc3f7"; g.lineWidth = 1.6; g.beginPath();
    let drawing = false;
    for (let k = 0; k < h.t.length; k++) {
      const v = h.minSep[k];
      if (v == null || h.t[k] < 2.3) { drawing = false; continue; }
      const x = X(h.t[k]), y = Y(v * 100);
      if (drawing) g.lineTo(x, y); else g.moveTo(x, y);
      drawing = true;
    }
    g.stroke();
  }
  { // altitude of each drone, m
    const [g, W, H] = prepareCanvas($("chart-alt")), pl = 28, pr = 8, pt = 8, pb = 18, ymax = Math.ceil(CAGE.Z);
    const X = t => pl + (W - pl - pr) * t / tmax, Y = v => pt + (H - pt - pb) * (1 - v / ymax);
    axisStyle(g);
    for (let v = 0; v <= ymax; v += 0.5) { g.beginPath(); g.moveTo(pl, Y(v)); g.lineTo(W - pr, Y(v)); g.stroke(); if (v % 1 === 0) g.fillText(v, 8, Y(v) + 3); }
    for (let t = 0; t <= tmax; t += tStep) g.fillText(t + "s", X(t) - 8, H - 4);
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = DRONE_CSS[i]; g.lineWidth = 1.5; g.beginPath();
      let drawing = false;
      h.z[i].forEach((v, k) => {
        if (v == null) { drawing = false; return; }
        const x = X(h.t[k]), y = Y(v);
        if (drawing) g.lineTo(x, y); else g.moveTo(x, y);
        drawing = true;
      });
      g.stroke();
    }
  }
}
