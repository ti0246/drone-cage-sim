/* =============================================================================
   state.js — what the user has chosen and what is on screen (shared by the page scripts)
   ページの状態 — ユーザーの選択と表示中の内容（ページ用スクリプト共通）
   ============================================================================= */
"use strict";

/** Shortcut for document.getElementById. */
const $ = id => document.getElementById(id);

/** Colours of the three drones: CF1 orange, CF2 blue, CF3 pink. */
const DRONE_COLORS = [0xffb347, 0x4fc3f7, 0xf06aa8];
const DRONE_CSS = ["#ffb347", "#4fc3f7", "#f06aa8"];

const state = {
  // left panel
  nav: "flow",              // guidance: "flow" (virtual flow field) or "direct" (straight line)
  form: "rl",               // spacing: "rl" (learned table), "spring" or "none"
  labFan: false,            // fan outside the net
  noise: false,             // position noise and radio loss
  windCompensation: true,   // drones lean against the wind they notice
  speed: 1,                 // simulation speed
  camera: "orbit",          // "orbit" (free), "follow", "top" or "door"
  altitude: 1.0,            // flight altitude, m
  show: { cells: false, pressure: false, flow: true, air: true, links: true, safety: false, downwash: true, trails: true },

  // what is in the cage, and the flight
  layout: "maze",           // name of the ready-made layout, or "custom" after any edit
  obstacles: [],            // see js/sim/obstacles.js
  nextId: 1,
  scenario: null,           // buildScenario()
  field: null,              // solveFlowField()
  swarm: null,              // the Swarm being flown
  running: true,

  // obstacle editor
  tool: null,               // null, "select", or the obstacle type being placed
  placeTurns: 0,            // quarter turns of the object being placed
  selectedId: null,

  activeStep: -1,           // "How it works" step on screen (−1 = none)
};

/** The selected obstacle, or undefined. */
function selectedObstacle() {
  return state.obstacles.find(o => o.id === state.selectedId);
}
