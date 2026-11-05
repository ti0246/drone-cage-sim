/* =============================================================================
   steps.js — "How it works": six buttons that each show one part of the method in 3D
   仕組み — 手法の各ステップを3Dで見せる6つのボタン
   ============================================================================= */
"use strict";

/** Layers and camera of each step. pos = camera position as fractions of the cage length and width, and a height. */
const STEP_VIEWS = [
  { show: { cells: true }, pos: [-0.6, -1.4, 3.6] },                         // 1 grid
  { show: { pressure: true }, top: true },                                   // 2 pressure
  { show: { flow: true }, pos: [-0.8, -1.3, 3.2] },                          // 3 flow
  { show: { links: true, trails: true }, camera: "follow", restart: true },  // 4 interaction
  { show: { links: true, safety: true, downwash: true }, camera: "follow", restart: true },              // 5 safety layer
  { show: { flow: true, air: true, links: true, downwash: true, trails: true }, camera: "follow", restart: true },  // 6 mission
];
const DEFAULT_LAYERS = { cells: false, pressure: false, flow: true, air: true, links: true, safety: false, downwash: true, trails: true };
const NO_LAYERS = { cells: false, pressure: false, flow: false, air: false, links: false, safety: false, downwash: false, trails: false };

function buildSteps() {
  const steps = text("steps");
  $("steps").innerHTML = `<span>${text("howTitle")}</span>` +
    steps.map((s, i) => `<button id="step-${i}" data-step="${i}" aria-pressed="${state.activeStep === i}"><i>${i + 1}</i>${s[0]}</button>`).join("") +
    `<button id="step-all" data-step="-1">${text("stepAll")}</button>`;
  document.querySelectorAll("#steps button").forEach(b => {
    b.onclick = () => { const i = +b.dataset.step; if (i < 0 || state.activeStep === i) hideStep(); else showStep(i); };
  });
}

function showStep(i) {
  const view = STEP_VIEWS[i], { X, Y, Z } = CAGE;
  state.activeStep = i;
  Object.assign(state.show, NO_LAYERS, view.show);
  syncLayerInputs();
  applyLayers();
  state.camera = view.camera || "orbit";
  setPressed("camera", state.camera);
  if (view.top) {
    camera.position.copy(toScene(X / 2, Y / 2 - 0.01, Z + Math.max(X, Y) * 0.95));
    controls.target.copy(toScene(X / 2, Y / 2, 0.6));
  } else if (view.pos) {
    camera.position.copy(toScene(X * view.pos[0], Y * view.pos[1], view.pos[2]));
    controls.target.copy(toScene(X / 2, Y / 2, 0.6));
  }
  if (view.restart) resetFlight();
  showStepNote(i);
  document.querySelectorAll("#steps button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.step === i)));
}

function showStepNote(i) {
  const [name, explanation] = text("steps")[i], note = $("step-note");
  note.innerHTML = `<b>${i + 1} · ${name}</b> — ${explanation}`;
  note.hidden = false;
}

function hideStep() {
  state.activeStep = -1;
  $("step-note").hidden = true;
  Object.assign(state.show, DEFAULT_LAYERS);
  syncLayerInputs();
  applyLayers();
  document.querySelectorAll("#steps button").forEach(b => b.setAttribute("aria-pressed", "false"));
}
