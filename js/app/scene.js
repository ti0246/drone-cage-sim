/* =============================================================================
   scene.js — the 3D scene: renderer, camera, lights, and the lab around the cage
   3Dシーン — 描画、カメラ、照明、ケージと実験室（床・壁・ネット・的・看板）

   Coordinates: the simulation uses x (along the cage), y (across) and z (up).
   Three.js uses y for up, so toScene() converts a simulation point to a scene point.
   ============================================================================= */
"use strict";

if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

const canvas = $("c"), view = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1218);
const camera = new THREE.PerspectiveCamera(45, 1, 0.02, 200);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.5;
controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI * 0.495;    // do not look from under the floor

/** Simulation point (x, y, z) → scene point. The cage is centred on the scene origin. */
function toScene(x, y, z) {
  return new THREE.Vector3(x - CAGE.X / 2, z, -(y - CAGE.Y / 2));
}
/** Scene point → simulation [x, y, z]. */
function fromScene(v) {
  return [v.x + CAGE.X / 2, -v.z + CAGE.Y / 2, v.y];
}

/** Default camera: high, from the entrance corner. */
function homeCamera() {
  const { X, Y, Z } = CAGE;
  camera.position.copy(toScene(-X * 0.55, -Y * 1.15, Z * 1.6));
  controls.target.copy(toScene(X * 0.5, Y * 0.5, 0.7));
}

function resizeRenderer() {
  const r = view.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resizeRenderer).observe(view);

/* ---------------------------------------------------------------- lights */
scene.add(new THREE.HemisphereLight(0xe6f0f7, 0x2a2f33, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 0.75);
sun.position.set(-3, 9, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 7, bottom: -7, near: 0.5, far: 25 });
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x3d4a52, 0.45));

/* ---------------------------------------------------------------- textures drawn on a canvas */
function canvasTexture(w, h, draw, repeat) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const TEXTURES = {
  turf: canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#1f8a3c"; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 9000; k++) {
      const v = Math.random();
      g.fillStyle = v > 0.6 ? "#27a049" : v > 0.3 ? "#1b7a35" : "#2db255";
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 3);
    }
  }, true),
  carpet: canvasTexture(256, 256, (g, w, h) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? "#5a6066" : "#6c7277"; g.fillRect(i * 128, j * 128, 128, 128); }
    for (let k = 0; k < 6000; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, true),
  net: canvasTexture(128, 128, g => {
    g.strokeStyle = "rgba(40,200,170,0.95)"; g.lineWidth = 2.2;
    for (let k = -4; k <= 8; k++) {
      g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 + 128, 128); g.stroke();
      g.beginPath(); g.moveTo(k * 32, 128); g.lineTo(k * 32 + 128, 0); g.stroke();
    }
  }, true),
  target: canvasTexture(256, 256, g => {
    g.fillStyle = "#f4f4f2"; g.fillRect(0, 0, 256, 256);
    [62, 48, 30, 14].forEach((r, i) => { g.fillStyle = ["#1e6b4a", "#f4f4f2", "#1e6b4a", "#d43a2f"][i]; g.beginPath(); g.arc(128, 128, r, 0, 7); g.fill(); });
    g.strokeStyle = "#cfcfcc"; g.lineWidth = 2; g.strokeRect(4, 4, 248, 248);
  }),
  sign: canvasTexture(1024, 192, g => {
    g.fillStyle = "#3fb59b"; g.fillRect(0, 0, 1024, 192);
    g.fillStyle = "#ffffff"; g.textAlign = "center";
    g.font = "600 46px 'Noto Sans JP', sans-serif"; g.fillText("エアロダイナミクス実験室", 512, 70);
    g.font = "italic 700 64px 'IBM Plex Sans', sans-serif"; g.fillText("AERODYNAMICS LABO", 512, 155);
  }),
  glow: canvasTexture(64, 64, g => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(0.25, "rgba(255,255,255,.3)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }),
  flash: canvasTexture(64, 64, g => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,120,110,1)"); gr.addColorStop(0.4, "rgba(255,90,95,.6)"); gr.addColorStop(1, "rgba(255,90,95,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }),
};

const ROOM_MATERIALS = {
  pipe: new THREE.MeshStandardMaterial({ color: 0x1b1f22, roughness: 0.55, metalness: 0.5 }),
  tape: new THREE.MeshStandardMaterial({ color: 0xc8232c, roughness: 0.6 }),
  turf: new THREE.MeshStandardMaterial({ map: TEXTURES.turf, roughness: 1 }),
  mat: new THREE.MeshStandardMaterial({ color: 0x3fbf5a, roughness: 1 }),
  carpet: new THREE.MeshStandardMaterial({ map: TEXTURES.carpet, roughness: 1 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xd9dddf, roughness: 0.95 }),
  white: new THREE.MeshStandardMaterial({ color: 0xeceeee, roughness: 0.6 }),
  leg: new THREE.MeshStandardMaterial({ color: 0x9aa1a6, metalness: 0.6, roughness: 0.4 }),
};

/* ---------------------------------------------------------------- the room and the cage */
const roomGroup = new THREE.Group();
scene.add(roomGroup);
let labFanBlades = null;          // spun by the animation loop when the lab fan is on

/** A steel pipe of the cage frame from a to b (scene points). */
function pipe(a, b, r = 0.025) {
  const d = b.clone().sub(a), length = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, 10), ROOM_MATERIALS.pipe);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  roomGroup.add(m);
}

/** A see-through panel of green net. */
function netPanel(w, h, position, rotY, rotX, opacity) {
  const t = TEXTURES.net.clone();
  t.needsUpdate = true;
  t.repeat.set(w / 0.22, h / 0.22);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: opacity || 0.55, side: THREE.DoubleSide, depthWrite: false }));
  m.position.copy(position);
  if (rotY) m.rotation.y = rotY;
  if (rotX) m.rotation.x = rotX;
  roomGroup.add(m);
}

/** Build the lab: floor, walls, turf, entrance mat, frame, net, target, sign, base stations, tables, lab fan. */
function buildRoom() {
  roomGroup.clear();
  const { X, Y, Z } = CAGE;
  const add = (mesh, position) => { if (position) mesh.position.copy(position); roomGroup.add(mesh); return mesh; };

  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(X + 8, Y + 8), ROOM_MATERIALS.carpet));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; floor.receiveShadow = true;
  floor.material.map.repeat.set(X + 8, Y + 8);
  add(new THREE.Mesh(new THREE.PlaneGeometry(X + 8, 3.2), ROOM_MATERIALS.wall), toScene(X / 2, Y + 4, 1.6));
  add(new THREE.Mesh(new THREE.PlaneGeometry(Y + 8, 3.2), ROOM_MATERIALS.wall), toScene(X + 4, Y / 2, 1.6)).rotation.y = -Math.PI / 2;
  const turf = add(new THREE.Mesh(new THREE.BoxGeometry(X, 0.02, Y), ROOM_MATERIALS.turf), toScene(X / 2, Y / 2, 0.01));
  turf.receiveShadow = true; turf.material.map.repeat.set(X * 2, Y * 2);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.012, 1.0), ROOM_MATERIALS.mat), toScene(0.75, Y / 2, 0.026)).receiveShadow = true;

  // frame: posts about every 1.85 m, top rails, cross bars, bottom rails
  const bays = Math.max(1, Math.round(X / 1.85)), xs = Array.from({ length: bays + 1 }, (_, k) => k * X / bays);
  for (const x of xs) for (const y of [0, Y]) pipe(toScene(x, y, 0), toScene(x, y, Z));
  for (const y of [0, Y]) { pipe(toScene(0, y, Z), toScene(X, y, Z)); pipe(toScene(0, y, 0.03), toScene(X, y, 0.03)); }
  for (const x of xs) pipe(toScene(x, 0, Z), toScene(x, Y, Z));
  pipe(toScene(0, 0, 0.03), toScene(0, Y, 0.03));
  pipe(toScene(X, 0, 0.03), toScene(X, Y, 0.03));
  for (let k = 0; k < 6; k++) {   // red tape on the entrance rail
    const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.08, 10), ROOM_MATERIALS.tape), toScene(0, (k + 0.5) * Y / 6, Z));
    m.rotation.x = Math.PI / 2;
  }
  const doorH = Math.min(2.0, Z - 0.1), door0 = Y * 0.62, door1 = Math.min(Y - 0.15, door0 + 0.8);
  pipe(toScene(0, door0, 0), toScene(0, door0, doorH));
  pipe(toScene(0, door1, 0), toScene(0, door1, doorH));
  pipe(toScene(0, door0, doorH), toScene(0, door1, doorH));

  // net on the sides, ends and roof
  netPanel(X, Z, toScene(X / 2, 0, Z / 2));
  netPanel(X, Z, toScene(X / 2, Y, Z / 2));
  netPanel(Y, Z, toScene(X, Y / 2, Z / 2), Math.PI / 2);
  netPanel(Y, Z, toScene(0, Y / 2, Z / 2), Math.PI / 2, 0, 0.35);
  netPanel(X, Y, toScene(X / 2, Y / 2, Z), 0, Math.PI / 2, 0.3);

  // target banner at the far end (centred on the flight altitude) and the lab sign over the entrance
  const targetZ = Math.max(0.7, Math.min(state.altitude, Z - 0.7));
  const target = add(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.25),
    new THREE.MeshStandardMaterial({ map: TEXTURES.target, roughness: 0.9, side: THREE.DoubleSide })), toScene(X - 0.04, Y / 2, targetZ));
  target.rotation.y = -Math.PI / 2;
  const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.375),
    new THREE.MeshBasicMaterial({ map: TEXTURES.sign, side: THREE.DoubleSide })), toScene(-0.03, Y / 2, Z - 0.25));
  sign.rotation.y = -Math.PI / 2;

  // Lighthouse base stations at two opposite top corners, pointing into the cage
  for (const [x, y, z] of baseStations()) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.4 })));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 20), new THREE.MeshBasicMaterial({ color: 0x3ddc97 }));
    lens.position.z = 0.041; g.add(lens);
    g.position.copy(toScene(x, y, z));
    g.lookAt(toScene(X / 2, Y / 2, 0.6));
    roomGroup.add(g);
  }

  // two work tables outside the net
  for (const [x, y] of [[1.0, -1.6], [2.8, -1.6]]) {
    const top = add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.6), ROOM_MATERIALS.white), toScene(x, y, 0.72));
    top.castShadow = true;
    for (const [a, b] of [[-0.65, -0.25], [0.65, -0.25], [-0.65, 0.25], [0.65, 0.25]]) {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.72), ROOM_MATERIALS.leg), toScene(x + a, y + b, 0.36));
    }
  }

  // the lab fan outside the net (Room conditions)
  const f = labFan(), fan = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xdfe3e7, roughness: 0.5, side: THREE.DoubleSide }));
  housing.rotation.x = Math.PI / 2;
  fan.add(housing);
  labFanBlades = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.01, 0.07), new THREE.MeshStandardMaterial({ color: 0x9aa3ab }));
    blade.rotation.y = k * Math.PI / 4; blade.rotation.z = 0.3;
    labFanBlades.add(blade);
  }
  labFanBlades.rotation.x = Math.PI / 2;
  fan.add(labFanBlades);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, f.z), ROOM_MATERIALS.pipe);
  stand.position.set(0, -f.z / 2, -0.05);
  fan.add(stand);
  fan.position.copy(toScene(f.x, f.y, f.z));
  fan.lookAt(toScene(f.x, f.y + 2, f.z));
  roomGroup.add(fan);
}
