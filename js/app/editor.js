/* =============================================================================
   editor.js — placing, stacking, moving, turning and resizing obstacles
   障害物エディタ — 配置、積み重ね、移動、回転、サイズ変更（数値入力にも対応）

   Place: pick an object in the bar, then click the floor, or click the top of a box,
          box stack or table to stack it there.
   Move:  "Select / drag", then drag. Everything stacked on the object moves with it.
   Edit:  the panel under the bar shows exact position and sizes (slider or typed value),
          and the on/off switch of fans and air conditioners.
   Every change keeps the placement rules of js/sim/obstacles.js; a change that breaks
   them is undone.
   ============================================================================= */
"use strict";

const obstacleGroup = new THREE.Group();
scene.add(obstacleGroup);
let selectionBox = null;      // green outline around the selected object
let ghost = null;             // see-through preview of the object being placed
let dragging = null;          // the drag in progress
let editSnapshot = null;      // copy of the obstacle list taken when a slider edit starts
let pointerDownAt = null;

/** Snap to a 5 cm grid. */
const snap = v => Math.round(v * 20) / 20;

/** A copy of the obstacle list (objects are flat, so a shallow copy of each is enough). */
const copyObstacles = list => list.map(o => ({ ...o }));

/* ---------------------------------------------------------------- 3D meshes of the obstacles */

function placeMesh(mesh, o) {
  mesh.position.copy(toScene(o.x, o.y, o.z || 0));
  mesh.rotation.y = quarterTurns(o) * Math.PI / 2;
}

function buildObstacleMeshes() {
  obstacleGroup.clear();
  for (const o of state.obstacles) {
    const mesh = obstacleModel(o);
    placeMesh(mesh, o);
    mesh.traverse(part => { part.userData.id = o.id; });   // any clicked part tells which obstacle it belongs to
    obstacleGroup.add(mesh);
  }
  updateSelectionBox();
}

function updateMeshPositions() {
  for (const mesh of obstacleGroup.children) {
    const o = state.obstacles.find(q => q.id === mesh.userData.id);
    if (o) placeMesh(mesh, o);
  }
  if (selectionBox) selectionBox.update();
}

function updateSelectionBox() {
  if (selectionBox) { scene.remove(selectionBox); selectionBox = null; }
  const mesh = obstacleGroup.children.find(m => m.userData.id === state.selectedId);
  if (mesh) { selectionBox = new THREE.BoxHelper(mesh, 0x3ddc97); scene.add(selectionBox); }
}

/** Spin the blades of every fan that is running (called by the animation loop). */
function spinFans(dt) {
  for (const mesh of obstacleGroup.children) {
    if (!mesh.userData.blades) continue;
    const o = state.obstacles.find(q => q.id === mesh.userData.id);
    if (o && size(o, "on")) mesh.userData.blades.rotation.z += dt * (8 + 6 * size(o, "v"));
  }
  if (selectionBox) selectionBox.update();
}

/* ---------------------------------------------------------------- pointer → cage position */

function pointerRay(e) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  return ray;
}

/** Where the ray meets the horizontal plane at `height` metres, as cage coordinates [x, y, z]. */
function hitPlane(ray, height) {
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), p) ? fromScene(p) : null;
}

/** Point for a new object: on the top face of the object under the pointer, else on the floor. */
function placementPoint(e) {
  const ray = pointerRay(e), hit = ray.intersectObjects(obstacleGroup.children, true)[0];
  if (hit && hit.face) {
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (normal.y > 0.7) { const p = fromScene(hit.point); return { x: p[0], y: p[1] }; }
  }
  const p = hitPlane(ray, 0);
  return p && { x: p[0], y: p[1] };
}

/** The object that would be placed at (x, y): it goes on top of whatever flat top is there. */
function newObstacle(type, x, y) {
  const o = { id: state.nextId, type, x: snap(x), y: snap(y), rot: state.placeTurns };
  const support = OBSTACLE_TYPES[type].mounted ? { z: 0, id: 0 } : supportUnder(o, state.obstacles, state.obstacles.length);
  o.z = support.z;
  o.restsOn = support.id;
  return clampSizes(o);
}

/** Fans and air conditioners are numbered per type: Fan 1, Fan 2, … */
function nextNumber(type) {
  return 1 + state.obstacles.filter(o => o.type === type).reduce((m, o) => Math.max(m, o.number || 0), 0);
}

function warnBadPlace() {
  toast(text("badPlace"));
  setTimeout(() => toast(""), 1400);
}

/* ---------------------------------------------------------------- placing (the ghost preview) */

function makeGhost(o) {
  if (ghost) { scene.remove(ghost); ghost = null; }
  if (!o) return;
  ghost = obstacleModel(o);
  const material = new THREE.MeshBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.45, depthWrite: false });
  ghost.traverse(part => { if (part.material) { part.material = material; part.castShadow = false; } });
  ghost.userData.material = material;
  ghost.userData.key = [o.z, size(o, "h"), quarterTurns(o)].join();
  ghost.visible = false;
  scene.add(ghost);
}

function previewPlacement(e) {
  const p = placementPoint(e);
  if (!p) { ghost.visible = false; return; }
  const o = newObstacle(state.tool, p.x, p.y);
  if (ghost.userData.key !== [o.z, size(o, "h"), quarterTurns(o)].join()) makeGhost(o);   // its height changed
  placeMesh(ghost, o);
  ghost.visible = true;
  ghost.userData.material.color.set(isValidSpot(o) ? 0x3ddc97 : 0xff5a5f);
}

/** Put a new object of this type at (x, y), on top of whatever flat top is there. Returns it, or null if not allowed. */
function addObstacle(type, x, y) {
  const o = newObstacle(type, x, y);
  if (!isValidSpot(o)) { warnBadPlace(); return null; }
  if (OBSTACLE_TYPES[o.type].air) o.number = nextNumber(o.type);
  state.nextId++;
  state.obstacles.push(o);
  settle(state.obstacles);
  buildObstacleMeshes();
  obstaclesChanged();
  return o;
}

function placeAt(e) {
  const p = placementPoint(e);
  if (p) addObstacle(state.tool, p.x, p.y);
}

/* ---------------------------------------------------------------- moving (drag) */

/** Move the object with this id, and everything stacked on it, by (dx, dy); the moved stack goes on top. */
function moveStack(list, id, dx, dy) {
  const o = list.find(q => q.id === id), stack = [o, ...objectsOnTop(o, list)];
  for (const q of stack) { q.x = Math.round((q.x + dx) * 100) / 100; q.y = Math.round((q.y + dy) * 100) / 100; }
  const moved = list.filter(q => !stack.includes(q)).concat(stack);
  settle(moved);
  return moved;
}

function startDrag(e) {
  const hit = pointerRay(e).intersectObjects(obstacleGroup.children, true)[0];
  if (!hit) { select(null); return; }
  // Select it now, but show its panel only when the drag ends: a panel appearing under the
  // 3D view would make the view smaller in the middle of the drag.
  state.selectedId = hit.object.userData.id;
  updateSelectionBox();
  const o = selectedObstacle(), p = fromScene(hit.point);
  dragging = { id: o.id, x0: o.x, y0: o.y, grab: [p[0], p[1]], height: p[2], snapshot: copyObstacles(state.obstacles), moved: false };
  controls.enabled = false;
  canvas.setPointerCapture(e.pointerId);
}

function dragTo(e) {
  const p = hitPlane(pointerRay(e), dragging.height);     // drag on the plane at the height where the object was grabbed
  if (!p) return;
  const dx = snap(dragging.x0 + p[0] - dragging.grab[0]) - dragging.x0;
  const dy = snap(dragging.y0 + p[1] - dragging.grab[1]) - dragging.y0;
  state.obstacles = moveStack(copyObstacles(dragging.snapshot), dragging.id, dx, dy);
  dragging.moved = dx !== 0 || dy !== 0;
  updateMeshPositions();
}

function finishDrag() {
  const d = dragging;
  dragging = null;
  controls.enabled = true;
  renderSelected();
  syncTools();
  if (!d.moved) { state.obstacles = d.snapshot; return; }
  if (!state.obstacles.every(isValidSpot)) {
    state.obstacles = d.snapshot;
    buildObstacleMeshes();
    warnBadPlace();
    return;
  }
  buildObstacleMeshes();
  obstaclesChanged();
}

canvas.addEventListener("pointerdown", e => {
  pointerDownAt = [e.clientX, e.clientY];
  if (state.tool === "select") startDrag(e);
});
canvas.addEventListener("pointermove", e => {
  if (dragging) dragTo(e);
  else if (ghost) previewPlacement(e);
});
canvas.addEventListener("pointerleave", () => { if (ghost) ghost.visible = false; });
canvas.addEventListener("pointerup", e => {
  if (dragging) { finishDrag(); return; }
  const isClick = pointerDownAt && Math.hypot(e.clientX - pointerDownAt[0], e.clientY - pointerDownAt[1]) <= 5;   // not a camera drag
  if (state.tool && state.tool !== "select" && isClick) placeAt(e);
});

/* ---------------------------------------------------------------- tools: select, rotate, delete, clear */

function setTool(tool) {
  state.tool = tool;
  state.placeTurns = 0;
  if (tool !== "select") select(null);
  makeGhost(tool && tool !== "select" ? clampSizes({ type: tool, rot: 0 }) : null);
  syncTools();
}

function select(id) {
  state.selectedId = id;
  updateSelectionBox();
  renderSelected();
  syncTools();
}

function rotateSelected() {
  if (state.tool && state.tool !== "select") {             // turn the object being placed
    state.placeTurns = (state.placeTurns + 1) % 4;
    if (ghost) ghost.rotation.y = state.placeTurns * Math.PI / 2;
    return;
  }
  const o = selectedObstacle();
  if (!o) return;
  const snapshot = copyObstacles(state.obstacles);
  o.rot = (quarterTurns(o) + 1) % 4;
  settle(state.obstacles);
  if (!state.obstacles.every(isValidSpot)) { state.obstacles = snapshot; warnBadPlace(); return; }
  buildObstacleMeshes();
  obstaclesChanged();
}

function deleteSelected() {
  const k = state.obstacles.findIndex(o => o.id === state.selectedId);
  if (k < 0) return;
  state.obstacles.splice(k, 1);
  state.selectedId = null;
  arrangeObstacles(state.obstacles);                       // whatever stood on it drops down
  buildObstacleMeshes();
  obstaclesChanged();
}

function clearAll() {
  if (!state.obstacles.length) return;
  state.obstacles = [];
  state.selectedId = null;
  buildObstacleMeshes();
  obstaclesChanged();
}

$("tool-select").onclick = () => setTool(state.tool === "select" ? null : "select");
$("tool-rotate").onclick = rotateSelected;
$("tool-delete").onclick = deleteSelected;
$("tool-clear").onclick = clearAll;

document.addEventListener("keydown", e => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
  if (e.key === "Escape") { setTool(null); hideStep(); }
  else if (e.key === "r" || e.key === "R") rotateSelected();
  else if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) { e.preventDefault(); deleteSelected(); }
  else if (e.key === " " && e.target === document.body) { e.preventDefault(); setRunning(!state.running); }
});

/* ---------------------------------------------------------------- palette of objects */

const PALETTE_ICONS = {
  box: '<rect x="4" y="6" width="12" height="11" rx="1"/><path d="M4 9h12M10 6v3"/>',
  stack: '<rect x="5" y="2" width="10" height="5"/><rect x="5" y="7.5" width="10" height="5"/><rect x="5" y="13" width="10" height="5"/>',
  pole: '<path d="M10 3v13M6 18l4-3 4 3"/><rect x="7.5" y="2" width="5" height="3"/>',
  chair: '<path d="M6 3v8h8M6 11v7M14 11v7M6 11h8"/>',
  table: '<path d="M2 7h16M4 7v10M16 7v10"/>',
  ball: '<circle cx="10" cy="10" r="7"/><path d="M4 8c4 2 8 2 12 0"/>',
  panel: '<rect x="3" y="3" width="14" height="12"/><path d="M6 18h2M12 18h2"/>',
  gate: '<path d="M4 18V3h12v15"/><rect x="7" y="7" width="6" height="6"/>',
  bar: '<path d="M6 2v8M14 2v8M3 11h14"/>',
  fan: '<circle cx="10" cy="8" r="5.5"/><path d="M10 8l2.5-3M10 8l-3.5-1M10 8l1 3.5M10 13.5V18M6.5 18h7"/>',
  aircon: '<rect x="2" y="3" width="16" height="7" rx="1.5"/><path d="M5 7.5h10M6 13l-1.5 4M10 13v4M14 13l1.5 4"/>',
};

function buildPalette() {
  $("palette").innerHTML = Object.keys(OBSTACLE_TYPES).map(type =>
    `<button id="add-${type}" data-type="${type}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">${PALETTE_ICONS[type]}</svg>${text("names")[type]}</button>`).join("");
  document.querySelectorAll("#palette button").forEach(b => {
    b.onclick = () => setTool(state.tool === b.dataset.type ? null : b.dataset.type);
  });
  syncTools();
}

/** Pressed buttons, the Delete button and the hint line follow the current tool and selection. */
function syncTools() {
  document.querySelectorAll("#palette button").forEach(b => b.setAttribute("aria-pressed", String(state.tool === b.dataset.type)));
  $("tool-select").setAttribute("aria-pressed", String(state.tool === "select"));
  const o = selectedObstacle();
  $("tool-delete").disabled = !o;
  $("hint").innerHTML = state.tool && state.tool !== "select" ? text("hintPlace")(text("names")[state.tool])
    : state.tool === "select" ? (o ? text("hintSel")(obstacleName(o)) : text("hintSelect"))
    : text("hintIdle");
}

/* ---------------------------------------------------------------- panel of the selected object */

/** Label of a size, which depends on the kind of object (a partition has a length, a ball a diameter …). */
function sizeLabel(o, key) {
  const L = text("sizes");
  if (key === "w" && (o.type === "panel" || o.type === "bar")) return L.len;
  if (key === "h" && o.type === "ball") return L.dia;
  if (key === "h" && o.type === "fan") return L.head;
  if (key === "h" && o.type === "aircon") return L.mount;
  return L[key];
}
const unitOf = key => (key === "tilt" ? "°" : key === "v" ? "m/s" : "m");

/** Slider range of a value, so the object stays inside the cage and under the ceiling. */
function valueRange(o, key, lo, hi) {
  const { X, Y, Z } = CAGE, base = o.z || 0, f = footprint(o);
  if (key === "x") return [f.w / 2 + 0.05, X - f.w / 2 - 0.05];
  if (key === "y") return [f.d / 2 + 0.05, Y - f.d / 2 - 0.05];
  if (key === "h") {
    if (o.type === "ball") hi = Math.min(hi, Z - 0.1 - base);
    else if (o.type === "fan") hi = Math.min(hi, Z - base - 0.25);
    else if (o.type === "aircon") hi = Math.min(hi, Z - 0.2);
    else hi = Math.min(hi, Z - base);
  }
  if (key === "z0") hi = Math.min(hi, Z - 0.2);
  if (key === "ow") hi = Math.min(hi, size(o, "w") - 0.1, size(o, "h") - 0.15);
  if (key === "oc") { lo = Math.max(lo, size(o, "ow") / 2 + 0.05); hi = Math.min(hi, size(o, "h") - size(o, "ow") / 2 - 0.05); }
  return [lo, Math.max(lo, hi)];
}

/** "On the floor", "On top of the table, 0.72 m up", "Mounted at 2.30 m" … */
function whereText(o) {
  if (o.type === "aircon") return text("mountedAt")(size(o, "h").toFixed(2));
  if (o.type === "bar") return text("hangsAt")(size(o, "z0").toFixed(2));
  const support = state.obstacles.find(q => q.id === o.restsOn);
  return support ? text("onTop")(obstacleName(support), (o.z || 0).toFixed(2)) : text("onFloor");
}

function renderSelected() {
  const box = $("selected"), o = selectedObstacle();
  if (!o) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  const type = OBSTACLE_TYPES[o.type];
  const rows = [["x", 0, 0], ["y", 0, 0]].concat(type.sizes);
  const controls = rows.map(([key, lo, hi]) => {
    const [min, max] = valueRange(o, key, lo, hi), step = key === "tilt" ? 5 : 0.05, digits = key === "tilt" ? 0 : 2;
    const value = key === "x" || key === "y" ? o[key] : size(o, key);
    return `<div class="ctrl"><label for="sel-${key}">${sizeLabel(o, key)}</label>` +
      `<input type="range" id="sel-${key}" data-key="${key}" min="${min.toFixed(2)}" max="${max.toFixed(2)}" step="${step}" value="${value}">` +
      `<span class="num"><input type="number" id="sel-${key}-num" data-key="${key}" min="${min.toFixed(2)}" max="${max.toFixed(2)}" step="${step}" value="${value.toFixed(digits)}"> ${unitOf(key)}</span></div>`;
  }).join("");
  const onSwitch = type.air
    ? `<label class="sw" for="sel-on"><span>${text("running")}</span><input type="checkbox" id="sel-on"${size(o, "on") ? " checked" : ""}></label>` : "";
  box.innerHTML = `<div class="head"><span class="name">${obstacleName(o)}</span><span class="where">${whereText(o)}</span>${onSwitch}</div>` +
                  `<div class="ctrls">${controls}</div>`;

  box.querySelectorAll('input[type="range"]').forEach(input => {
    input.addEventListener("input", () => previewEdit(input.dataset.key, +input.value));
    input.addEventListener("change", () => commitEdit(input.dataset.key));
  });
  box.querySelectorAll('input[type="number"]').forEach(input => {
    input.addEventListener("change", () => { previewEdit(input.dataset.key, +input.value); commitEdit(input.dataset.key); });
  });
  if (type.air) $("sel-on").addEventListener("change", e => switchAir(o.id, e.target.checked));
}

/** Show a changed value at once (while a slider moves). The list is rebuilt from the copy taken at the start. */
function previewEdit(key, value) {
  if (!isFinite(value)) return;
  if (!editSnapshot) editSnapshot = copyObstacles(state.obstacles);
  let list = copyObstacles(editSnapshot);
  const o = list.find(q => q.id === state.selectedId);
  if (key === "x") list = moveStack(list, o.id, value - o.x, 0);
  else if (key === "y") list = moveStack(list, o.id, 0, value - o.y);
  else { o[key] = value; clampSizes(o); settle(list); }
  state.obstacles = list;
  buildObstacleMeshes();
  const shown = list.find(q => q.id === state.selectedId), num = $("sel-" + key + "-num");
  if (num && shown) num.value = (key === "x" || key === "y" ? shown[key] : size(shown, key)).toFixed(key === "tilt" ? 0 : 2);
}

/** Keep the change if every object still follows the placement rules, otherwise undo it. */
function commitEdit(key) {
  const snapshot = editSnapshot;
  editSnapshot = null;
  if (!snapshot) return;
  if (!state.obstacles.every(isValidSpot)) {
    state.obstacles = snapshot;
    buildObstacleMeshes();
    renderSelected();
    warnBadPlace();
    return;
  }
  renderSelected();
  if (key === "v" || key === "tilt") airflowChanged(selectedObstacle());   // only the air changes: no new flow field
  else obstaclesChanged();
}

/** The on/off switch of a fan or air conditioner (also used by the list in the left panel). */
function switchAir(id, on) {
  const o = state.obstacles.find(q => q.id === id);
  if (!o) return;
  o.on = on;
  if (state.swarm) logEvent(text("evAir")(state.swarm.t.toFixed(1), obstacleName(o), on), "e-info");
  airflowChanged(null);
}
