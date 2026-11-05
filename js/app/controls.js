/* =============================================================================
   controls.js — the left panel and the header: run buttons, cage size, guidance,
                 spacing, room conditions, fans and air conditioners, layers, camera, language
   左パネルとヘッダー — 操作、ケージのサイズ、誘導、間隔維持、室内条件、表示、カメラ、言語
   ============================================================================= */
"use strict";

/** Mark the button whose data-v equals v as pressed, inside the group with this id. */
function setPressed(groupId, v) {
  document.querySelectorAll(`#${groupId} [data-v]`).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === String(v))));
}
/** Call fn(value) when a button of the group is clicked. */
function bindGroup(groupId, fn) {
  document.querySelectorAll(`#${groupId} [data-v]`).forEach(b => b.addEventListener("click", () => { fn(b.dataset.v); setPressed(groupId, b.dataset.v); }));
}

/* ---------------------------------------------------------------- run */
function setRunning(running) {
  state.running = running;
  $("play").textContent = running ? text("pause") : text("play");
  if (state.swarm) updateHUD();
}
$("play").onclick = () => setRunning(!state.running);
$("reset").onclick = () => resetFlight();
bindGroup("speed", v => { state.speed = +v; });

/* ---------------------------------------------------------------- cage size (slider or typed value) */

const CAGE_INPUTS = [["cage-x", "X", 1], ["cage-y", "Y", 1], ["cage-z", "Z", 1], ["alt", "altitude", 2]];   // [id, value, decimals]

/** Show the current cage size and flight altitude in the sliders and number boxes. */
function syncCageInputs() {
  const values = { X: CAGE.X, Y: CAGE.Y, Z: CAGE.Z, altitude: state.altitude };
  const altMax = (CAGE.Z - 0.6).toFixed(2);
  $("alt").max = altMax;
  $("alt-num").max = altMax;
  for (const [id, key, digits] of CAGE_INPUTS) {
    $(id).value = values[key];
    $(id + "-num").value = values[key].toFixed(digits);
  }
  $("scale-note").textContent = text("scale")(CAGE.X, CAGE.Y, CAGE.Z);
  updateLighthouse();
}

/** Read the four values, keep them inside their limits, and rebuild the cage. */
function applyCageInputs() {
  const x = clamp(+$("cage-x").value, ...CAGE_LIMITS.X);
  const y = clamp(+$("cage-y").value, ...CAGE_LIMITS.Y);
  const z = clamp(+$("cage-z").value, ...CAGE_LIMITS.Z);
  applyCageSize(x, y, z, +$("alt").value);
}

for (const [id, , digits] of CAGE_INPUTS) {
  const slider = $(id), box = $(id + "-num");
  slider.addEventListener("input", () => {            // while dragging: update the number box only
    box.value = (+slider.value).toFixed(digits);
    if (id === "cage-z") { $("alt").max = $("alt-num").max = (+slider.value - 0.6).toFixed(2); }
  });
  slider.addEventListener("change", applyCageInputs); // on release: rebuild the cage
  box.addEventListener("change", () => {               // typed value (Enter or leaving the box)
    if (!isFinite(+box.value) || box.value === "") { syncCageInputs(); return; }
    slider.value = box.value;
    applyCageInputs();
  });
}
$("cage-reset").onclick = () => applyCageSize(PHOTO_CAGE.X, PHOTO_CAGE.Y, PHOTO_CAGE.Z, PHOTO_CAGE.altitude);

function updateLighthouse() {
  const d = lighthouseReach(), el = $("lighthouse"), ok = d <= LIGHTHOUSE_RANGE;
  el.className = "lh " + (ok ? "ok" : "bad");
  el.innerHTML = (ok ? text("lhOk") : text("lhBad"))(d.toFixed(1));
}

/* ---------------------------------------------------------------- guidance and spacing */
bindGroup("nav", v => { state.nav = v; if (state.swarm) state.swarm.options.nav = v; updateHUD(); });
bindGroup("form", v => { state.form = v; if (state.swarm) state.swarm.options.form = v; updateHUD(); });

/* ---------------------------------------------------------------- room conditions */
$("lab-fan").onchange = e => {
  state.labFan = e.target.checked;
  if (state.swarm) state.swarm.options.labFan = state.labFan;
  buildAirStreams();
  renderComparison();
};
$("noise").onchange = e => {
  state.noise = e.target.checked;
  if (state.swarm) state.swarm.options.noise = state.noise;
  renderComparison();
};
$("wind-comp").onchange = e => {
  state.windCompensation = e.target.checked;
  if (state.swarm) state.swarm.options.windCompensation = state.windCompensation;
  renderComparison();
};

/** "blows to the far side · 1.5 m/s · louver 30°" */
function describeAir(o) {
  const parts = [text("blow")[quarterTurns(o)], size(o, "v").toFixed(1) + " m/s"];
  if (o.type === "aircon") parts.push(`${text("louver")} ${size(o, "tilt").toFixed(0)}°`);
  return parts.join(" · ");
}

/** List of the fans and air conditioners in the cage, each with its own on/off switch. */
function renderAirList() {
  const box = $("air-list"), sources = state.obstacles.filter(o => OBSTACLE_TYPES[o.type].air);
  if (!sources.length) { box.innerHTML = `<p class="note" style="margin:0">${text("airNone")}</p>`; return; }
  box.innerHTML = sources.map(o =>
    `<div class="air-item"><button data-id="${o.id}">${obstacleName(o)}</button>` +
    `<label class="sw" for="air-${o.id}"><input type="checkbox" id="air-${o.id}" data-id="${o.id}"${size(o, "on") ? " checked" : ""} aria-label="${obstacleName(o)}"></label>` +
    `<small>${describeAir(o)}</small></div>`).join("");
  box.querySelectorAll("button").forEach(b => { b.onclick = () => { setTool("select"); select(+b.dataset.id); }; });
  box.querySelectorAll("input").forEach(input => { input.onchange = () => switchAir(+input.dataset.id, input.checked); });
}

/* ---------------------------------------------------------------- layers and camera */
const LAYER_INPUTS = { cells: "show-cells", pressure: "show-pressure", flow: "show-flow", air: "show-air", links: "show-links",
                       safety: "show-safety", downwash: "show-downwash", trails: "show-trails" };
for (const [key, id] of Object.entries(LAYER_INPUTS)) $(id).onchange = e => { state.show[key] = e.target.checked; applyLayers(); };
function syncLayerInputs() {
  for (const [key, id] of Object.entries(LAYER_INPUTS)) $(id).checked = state.show[key];
}

bindGroup("camera", v => { state.camera = v; });
controls.addEventListener("start", () => {         // dragging the view switches back to the free camera
  if (state.camera !== "orbit") { state.camera = "orbit"; setPressed("camera", "orbit"); }
});

/* ---------------------------------------------------------------- layouts */
bindGroup("layouts", v => loadLayout(v));

/* ---------------------------------------------------------------- language */
bindGroup("lang", v => setLanguage(v));

function setLanguage(v) {
  language = v;
  try { localStorage.setItem("cage-lang2", v); } catch (e) { /* storage blocked */ }
  document.documentElement.lang = v;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const s = text(el.dataset.i18n);
    if (typeof s === "string") el.textContent = s;
  });
  document.title = text("title");
  $("play").textContent = state.running ? text("pause") : text("play");
  $("foot").textContent = text("foot");
  setPressed("lang", v);
  buildDroneCards();
  buildPalette();
  buildSteps();
  syncCageInputs();
  renderSelected();
  renderAirList();
  renderComparison();
  if (state.activeStep >= 0) showStepNote(state.activeStep);
  if (state.swarm) updateHUD();
}
