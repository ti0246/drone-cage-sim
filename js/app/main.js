/* =============================================================================
   main.js — start-up, the life cycle of a flight, and the animation loop
   メイン — 起動、飛行の準備（流れ場の計算・リセット）、毎フレームの描画

   Order of work after any change:
     obstacles or cage changed → buildScenario() → solveFlowField() → new flow lines,
     pressure map and grid cells → the flight goes on (or restarts) with the new field.
   ============================================================================= */
"use strict";

const droneGroup = new THREE.Group();
scene.add(droneGroup);
let drones = [];                         // the three 3D drone models

/* ---------------------------------------------------------------- the life cycle */

/** Build the scenario and solve the flow field (up to about a second), then run `after`. */
function recomputeField(message, after) {
  toast(message || text("recalc"));
  setTimeout(() => {                     // let the browser show the message first
    state.scenario = buildScenario(state.obstacles, state.altitude);
    state.field = solveFlowField(state.scenario);
    buildFlowLines();
    buildPressureSlice();
    buildSolidCells();
    buildAirStreams();
    applyLayers();
    if (state.swarm) { state.swarm.scenario = state.scenario; state.swarm.field = state.field; }   // a flight in progress uses the new field
    toast("");
    if (after) after();
    renderComparison();
  }, 30);
}

/** Fans and air conditioners of a ready-made layout get the numbers 1, 2, … per type. */
function numberAirSources(list) {
  const count = {};
  for (const o of list) if (OBSTACLE_TYPES[o.type].air) { count[o.type] = (count[o.type] || 0) + 1; o.number = count[o.type]; }
}

function afterObstacleListReplaced() {
  numberAirSources(state.obstacles);
  state.nextId = state.obstacles.reduce((m, o) => Math.max(m, o.id), 0) + 1;
  state.selectedId = null;
  buildObstacleMeshes();
  syncTools();
  renderSelected();
  renderAirList();
}

/** Load one of the ready-made layouts. */
function loadLayout(name) {
  state.layout = name;
  state.obstacles = buildLayout(name);
  setPressed("layouts", name);
  afterObstacleListReplaced();
  recomputeField(text("loading")(gridCellCount()), () => { buildRoom(); resetFlight(); });
}

/** Change the cage size and flight altitude. A ready-made layout is rebuilt to fit; a custom layout is kept. */
function applyCageSize(x, y, z, altitude) {
  setCageSize(x, y, z);
  state.altitude = clampAltitude(altitude);
  let planned;
  if (state.layout !== "custom") {
    planned = LAYOUTS[state.layout](x, y).length;
    state.obstacles = buildLayout(state.layout);
    afterObstacleListReplaced();
  } else {
    planned = state.obstacles.length;
    arrangeObstacles(state.obstacles);   // stack, trim to the ceiling, remove what does not fit
    state.selectedId = null;
    buildObstacleMeshes();
    syncTools();
    renderSelected();
    renderAirList();
  }
  const kept = state.obstacles.length;
  syncCageInputs();
  recomputeField(text("loading")(gridCellCount()), () => {
    buildRoom();
    resetFlight();
    homeCamera();
    if (kept < planned) logEvent(text("evTrim")(kept, planned), "e-bad");
  });
}

/** Called after any edit of the obstacles: the layout becomes "custom" and the flow field is recomputed. */
function obstaclesChanged() {
  state.layout = "custom";
  setPressed("layouts", "custom");
  syncTools();
  renderSelected();
  renderAirList();
  recomputeField(null, () => { if (state.swarm) logEvent(text("evEdit")(state.swarm.t.toFixed(1)), "e-info"); });
}

/**
 * Called when only the air changes (switch, wind speed, louver angle). The flow field is computed
 * again, because it goes around strong air; the flight in progress goes on.
 */
function airflowChanged(o) {
  state.layout = "custom";
  setPressed("layouts", "custom");
  buildObstacleMeshes();
  renderAirList();
  renderSelected();
  recomputeField(null, () => { if (o && state.swarm) logEvent(text("evAirChange")(state.swarm.t.toFixed(1), obstacleName(o)), "e-info"); });
}

/** Put the drones back on their pads and start a new flight. */
function resetFlight() {
  state.swarm = new Swarm(state.scenario, state.field, POLICY_TABLE,
    { nav: state.nav, form: state.form, labFan: state.labFan, noise: state.noise, windCompensation: state.windCompensation }, 1);
  droneGroup.clear();
  drones = [0, 1, 2].map(i => { const d = droneModel(i); droneGroup.add(d); return d; });
  buildTrails();
  buildFlightMarks();
  applyLayers();
  resetEventLog();
  stepClock = 0;
  logEvent(text("evLayout")(layoutName(state.layout)), "e-info");
  logEvent(text("evTakeoff"), "e-info");
  setRunning(true);
  syncDrones(0);
  updateHUD();
}

/* ---------------------------------------------------------------- every frame */

let stepClock = 0, trailTick = 0, hudTick = 0, lastFrame = performance.now();

function simulationStep() {
  state.swarm.step();
  if (++trailTick % 3 === 0) extendTrails();
  showNewEvents();
}

const tmpQuat = new THREE.Quaternion(), yawQuat = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), tmpVec = new THREE.Vector3();

/** Move the 3D drones to their simulated positions; tilt them with their acceleration; spin the propellers. */
function syncDrones(dt) {
  const s = state.swarm;
  for (let i = 0; i < 3; i++) {
    const d = drones[i], u = d.userData, st = s.state[i];
    d.position.copy(toScene(s.px[i], s.py[i], s.pz[i] + 0.025));
    downwashCones[i].visible = state.show.downwash && st === STATE.FLYING && s.pz[i] > 0.15;
    if (downwashCones[i].visible) downwashCones[i].position.copy(toScene(s.px[i], s.py[i], s.pz[i] - SAFETY.downwashDepth / 2 - 0.02));
    safetySpheres[i].visible = state.show.safety && st === STATE.FLYING;
    safetySpheres[i].position.copy(toScene(s.px[i], s.py[i], s.pz[i]));
    if (st === STATE.CRASHED) {         // red, tipped over
      u.ledMaterial.color.set(0xff5a5f); u.glowMaterial.color.set(0xff5a5f); u.pcb.material = DRONE_MATERIALS.crashed;
      d.quaternion.slerp(tmpQuat.setFromAxisAngle(tmpVec.set(1, 0, 0.4).normalize(), 2.4), 0.06);
      continue;
    }
    if (st === STATE.LANDED) { d.quaternion.slerp(new THREE.Quaternion(), 0.2); u.glowMaterial.opacity = 0.35; continue; }
    // the thrust points along acceleration + gravity, so the drone leans into its acceleration
    tmpVec.set(s.ax[i], s.az[i] + 9.81, -s.ay[i]).normalize();
    tmpQuat.setFromUnitVectors(UP, tmpVec);
    if (Math.hypot(s.vx[i], s.vy[i]) > 0.05) u.yaw = Math.atan2(s.vx[i], s.vy[i]);
    yawQuat.setFromAxisAngle(UP, u.yaw);
    d.quaternion.slerp(tmpQuat.multiply(yawQuat), 0.25);
    const spin = s.pz[i] > 0.035 || s.phase === "takeoff" ? 90 : 0;
    u.props.forEach(p => { p.rotation.y += p.userData.dir * spin * dt; });
  }
}

/** Camera modes other than "free": follow the swarm, look from the top, or look from the door. */
function updateCamera(dt) {
  if (state.camera === "orbit") return;
  const k = 1 - Math.exp(-dt * 2.5), { X, Y, Z } = CAGE, s = state.swarm;
  if (state.camera === "door") {
    camera.position.lerp(toScene(-0.9, Y * 0.5, Math.min(1.7, Z - 0.2)), k);
    controls.target.lerp(toScene(X * 0.6, Y / 2, state.altitude * 0.8), k);
    return;
  }
  let cx = 0, cy = 0, cz = 0, n = 0, vx = 0, vy = 0;
  for (let i = 0; i < 3; i++) if (s.state[i] !== STATE.CRASHED) { cx += s.px[i]; cy += s.py[i]; cz += s.pz[i]; vx += s.vx[i]; vy += s.vy[i]; n++; }
  if (!n) return;
  cx /= n; cy /= n; cz /= n;
  controls.target.lerp(toScene(cx, cy, cz), k);
  if (state.camera === "top") camera.position.lerp(toScene(cx, cy - 0.01, Z + 3.5), k);
  else {                                // behind the swarm, a little to the side and above
    const speed = Math.hypot(vx, vy), bx = speed > 0.05 ? -vx / speed : -1, by = speed > 0.05 ? -vy / speed : 0;
    camera.position.lerp(toScene(cx + bx * 1.6 + by * 0.8, cy + by * 1.6 - bx * 0.8, cz + 0.9), k * 0.6);
  }
}

function renderFrame(dt) {
  syncDrones(dt);
  if (state.show.links) updateLinks();
  flowLineMaterial.uniforms.uTime.value += dt;
  if (goalRing) goalRing.rotation.z += dt * 0.5;
  if (labFanBlades) labFanBlades.rotation.y += (state.labFan ? 25 : 0) * dt;
  spinFans(dt);
  updateAirStreams(dt);
  updateFlashes(dt);
  updateCamera(dt);
  controls.update();
  if (++hudTick % 6 === 0) updateHUD();
  renderer.render(scene, camera);
}

/** The animation loop: run as many 0.02 s simulation steps as real time (× speed) allows, then draw. */
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.swarm && state.running && !simTest.manualClock) {
    stepClock += dt * state.speed;
    let n = 0;
    while (stepClock >= TIME.step && n < 30) { simulationStep(); stepClock -= TIME.step; n++; }
    if (n >= 30) stepClock = 0;          // the computer is too slow: do not try to catch up
  }
  if (state.swarm) renderFrame(dt);
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- hooks for automated browser tests */
const simTest = window.simTest = {
  manualClock: false,                    // true: the page only moves when step() is called
  state,
  step(n) { for (let k = 0; k < n; k++) simulationStep(); },
  render(dt) { renderFrame(dt || 1 / 30); },
  add: (type, x, y) => addObstacle(type, x, y),
  loadLayout, resetFlight, applyCageSize, showStep, hideStep, setTool, select, switchAir,
};

/* ---------------------------------------------------------------- start-up */
setPressed("speed", state.speed);
setPressed("nav", state.nav);
setPressed("form", state.form);
setPressed("camera", state.camera);
setPressed("layouts", state.layout);
syncLayerInputs();
state.scenario = buildScenario([], state.altitude);   // lets the room be drawn before the first field is ready
buildRoom();
setLanguage(language);
resizeRenderer();
homeCamera();
loadLayout(state.layout);
requestAnimationFrame(frame);
