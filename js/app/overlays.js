/* =============================================================================
   overlays.js — what is drawn on top of the cage to explain the methods
   補助表示 — 流れの線、圧力の断面、格子セル、風の粒子、軌跡、機体間リンク、安全領域

   Layers (left panel): grid cells, virtual pressure, virtual flow, air from fans and
   air conditioners, links between drones, safety zones, downwash zones, flight trails.
   ============================================================================= */
"use strict";

/* ---------------------------------------------------------------- virtual flow lines (2019 patent) */

// Moving bright dashes run along each line in the direction of the flow.
const flowLineMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x4fc3f7) } },
  vertexShader: "attribute float distanceAlong; varying float vDist; void main(){ vDist = distanceAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform float uTime; uniform vec3 uColor; varying float vDist; void main(){ float f = fract(vDist / 0.5 - uTime * 0.7); float a = 0.08 + 0.65 * pow(f, 6.0); gl_FragColor = vec4(mix(uColor, vec3(1.0), pow(f, 10.0) * 0.5) * a, 1.0); }",
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
let flowLines = null, pressureSlice = null, solidCells = null;

/** Trace lines through the flow field, starting from a grid of points at the entrance. */
function buildFlowLines() {
  if (flowLines) { scene.remove(flowLines); flowLines.geometry.dispose(); }
  const positions = [], distances = [], dir = [0, 0, 0], h = 0.04, { X, Y, Z } = CAGE, goal = state.scenario.goal;
  const stepY = Math.max(0.3, Y / 10), stepZ = Math.max(0.35, Z / 8);
  for (let y = 0.3; y < Y - 0.2; y += stepY) for (let z = 0.35; z < Z - 0.3; z += stepZ) {
    let p = [0.08, y, z], dist = 0, prev = toScene(p[0], p[1], p[2]);
    for (let s = 0; s < 600; s++) {
      if (flowDirectionAt(state.field, p[0], p[1], p[2], dir) === 0) break;
      p = [p[0] + dir[0] * h, p[1] + dir[1] * h, p[2] + dir[2] * h];
      if (p[0] < 0 || p[0] > X || p[1] < 0 || p[1] > Y || p[2] < 0.05 || p[2] > Z) break;
      const v = toScene(p[0], p[1], p[2]);
      positions.push(prev.x, prev.y, prev.z, v.x, v.y, v.z);
      distances.push(dist, dist + h);
      dist += h; prev = v;
      if (Math.hypot(p[0] - goal.x, p[1] - goal.y, p[2] - goal.z) < 0.25) break;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("distanceAlong", new THREE.Float32BufferAttribute(distances, 1));
  flowLines = new THREE.LineSegments(g, flowLineMaterial);
  flowLines.frustumCulled = false;
  scene.add(flowLines);
}

/** Colour map of the virtual pressure at flight altitude: orange = high (entrance), blue = low (goal), black = solid. */
function buildPressureSlice() {
  if (pressureSlice) { scene.remove(pressureSlice); pressureSlice.geometry.dispose(); pressureSlice.material.map.dispose(); }
  const F = state.field, { nx, ny, nz, dx } = F, k = Math.max(0, Math.min(nz - 1, Math.floor(state.altitude / dx)));
  const data = new Uint8Array(nx * ny * 4), values = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const c = F.index(i, j, k); if (F.free[c]) values.push(F.p[c]); }
  values.sort((a, b) => a - b);
  // colour by rank, so the whole colour range is used even where the pressure changes little
  const rank = v => { let lo = 0, hi = values.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (values[m] < v) lo = m + 1; else hi = m; } return lo / Math.max(1, values.length - 1); };
  const low = [40, 90, 200], mid = [120, 70, 160], high = [255, 143, 63];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = F.index(i, j, k), o = ((ny - 1 - j) * nx + i) * 4;
    if (!F.free[c]) { data.set(F.windy[c] ? [90, 170, 220, 200] : [10, 14, 18, 220], o); continue; }   // light blue = strong wind
    const r = rank(F.p[c]), A = r < 0.5 ? low : mid, B = r < 0.5 ? mid : high, f = r < 0.5 ? r * 2 : (r - 0.5) * 2;
    data.set([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, 170], o);
  }
  const tex = new THREE.DataTexture(data, nx, ny, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true; tex.encoding = THREE.sRGBEncoding;
  pressureSlice = new THREE.Mesh(new THREE.PlaneGeometry(nx * dx, ny * dx),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  pressureSlice.rotation.x = -Math.PI / 2;
  pressureSlice.position.copy(toScene(nx * dx / 2, ny * dx / 2, (k + 0.5) * dx));
  scene.add(pressureSlice);
}

/** One small cube for every grid cell the flow goes around: orange = obstacle, blue = strong wind. */
function buildSolidCells() {
  if (solidCells) { scene.remove(solidCells); solidCells.geometry.dispose(); }
  const F = state.field, { nx, ny, nz, dx } = F;
  let count = 0;
  for (let c = 0; c < F.free.length; c++) if (!F.free[c]) count++;
  solidCells = new THREE.InstancedMesh(new THREE.BoxGeometry(dx * 0.9, dx * 0.9, dx * 0.9),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false }), Math.max(1, count));
  const m4 = new THREE.Matrix4(), obstacleColor = new THREE.Color(0xff8f3f), windColor = new THREE.Color(0x5ab4e6);
  let q = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = F.index(i, j, k);
    if (F.free[c]) continue;
    m4.makeTranslation(...toScene((i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dx).toArray());
    solidCells.setMatrixAt(q, m4);
    solidCells.setColorAt(q, F.windy[c] ? windColor : obstacleColor);
    q++;
  }
  solidCells.count = count;
  solidCells.frustumCulled = false;
  scene.add(solidCells);
}

/* ---------------------------------------------------------------- air from fans and air conditioners */

const airGroup = new THREE.Group();
scene.add(airGroup);
const airDotMaterial = new THREE.PointsMaterial({ color: 0x9fd8ff, map: TEXTURES.glow, size: 0.07, transparent: true, opacity: 0.9, depthWrite: false });
let airStreams = [];

/** One cloud of moving dots for every air source that is on (lab fan, placed fans, air conditioners). */
function buildAirStreams() {
  airGroup.clear();
  airStreams = [];
  const sources = state.scenario.air.filter(s => s.on);
  if (state.labFan) sources.unshift(state.scenario.labFan);
  for (const src of sources) {
    const count = src.kind === "fan" ? 200 : 260, positions = new Float32Array(count * 3);
    const seeds = Array.from({ length: count }, () => [Math.random(), Math.random() - 0.5, Math.random() - 0.5]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const dots = new THREE.Points(g, airDotMaterial);
    dots.frustumCulled = false;
    airGroup.add(dots);
    airStreams.push({ src, positions, seeds, dots });
  }
}

/** Move the dots along each jet; their spread follows the jet model in js/sim/airflow.js. */
function updateAirStreams(dt) {
  airGroup.visible = state.show.air;
  if (!state.show.air) return;
  for (const { src, positions, seeds, dots } of airStreams) {
    for (let k = 0; k < seeds.length; k++) {
      const s = seeds[k];
      s[0] = (s[0] + dt * src.v / src.len * 0.5) % 1;      // position along the jet, 0 … 1
      const along = s[0] * src.len;
      let x, y, z;
      if (src.kind === "fan") {
        const width = src.w * (1 + along / src.len) * 0.9;
        const side = s[1] * width * 2, up = s[2] * width * 2;
        x = src.x + src.dx * along - src.dy * side;
        y = src.y + src.dy * along + src.dx * side;
        z = src.z + up;
      } else {
        const [ux, uy, uz] = airconAxis(src), sn = Math.sin(src.tilt), cs = Math.cos(src.tilt);
        const side = s[1] * (src.w + 0.3 * along), across = s[2] * (0.08 + 0.18 * along) * 2;
        x = src.x + ux * along - src.dy * side + src.dx * sn * across;
        y = src.y + uy * along + src.dx * side + src.dy * sn * across;
        z = src.z + uz * along + cs * across;
      }
      const v = toScene(x, y, Math.max(0.03, z));
      positions[k * 3] = v.x; positions[k * 3 + 1] = v.y; positions[k * 3 + 2] = v.z;
    }
    dots.geometry.attributes.position.needsUpdate = true;
  }
}

/* ---------------------------------------------------------------- the flight: pads, goal, trails, links, zones */

const padGroup = new THREE.Group();     // take-off pads, landing rings, goal ring
const zoneGroup = new THREE.Group();    // downwash cones and safety spheres
scene.add(padGroup, zoneGroup);
let goalRing = null, downwashCones = [], safetySpheres = [];

function buildFlightMarks() {
  padGroup.clear(); zoneGroup.clear(); downwashCones = []; safetySpheres = [];
  const swarm = state.swarm, padMaterial = new THREE.MeshStandardMaterial({ color: 0x1f262d, roughness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const [px, py] = swarm.pads[i], [lx, ly] = swarm.spots[i];
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.16), padMaterial);
    pad.position.copy(toScene(px, py, 0.037)); padGroup.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.07, 24), new THREE.MeshBasicMaterial({ color: DRONE_COLORS[i], side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(toScene(px, py, 0.044)); padGroup.add(ring);
    const spot = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.08, 28), new THREE.MeshBasicMaterial({ color: DRONE_COLORS[i], side: THREE.DoubleSide }));
    spot.rotation.x = -Math.PI / 2; spot.position.copy(toScene(lx, ly, 0.023)); padGroup.add(spot);

    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, SAFETY.downwashRadius, SAFETY.downwashDepth, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    zoneGroup.add(cone); downwashCones.push(cone);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(SAFETY.minSeparation / 2, 18, 12),
      new THREE.MeshBasicMaterial({ color: DRONE_COLORS[i], transparent: true, opacity: 0.16, depthWrite: false }));
    sphere.add(new THREE.Mesh(new THREE.SphereGeometry(SAFETY.obstacleRange, 18, 12),
      new THREE.MeshBasicMaterial({ color: DRONE_COLORS[i], wireframe: true, transparent: true, opacity: 0.12 })));
    zoneGroup.add(sphere); safetySpheres.push(sphere);
  }
  const sc = state.scenario;
  goalRing = new THREE.Mesh(new THREE.TorusGeometry(sc.goalRadius + 0.2, 0.008, 6, 64), new THREE.MeshBasicMaterial({ color: 0x3ddc97 }));
  goalRing.rotation.x = Math.PI / 2;
  goalRing.position.copy(toScene(sc.goal.x, sc.goal.y, sc.goal.z));
  padGroup.add(goalRing);
}

// flight trails: the last 220 positions of each drone
const TRAIL_POINTS = 220;
let trails = [];
function buildTrails() {
  trails.forEach(t => { scene.remove(t.line); t.line.geometry.dispose(); });
  trails = [];
  for (let i = 0; i < 3; i++) {
    const pos = new Float32Array(TRAIL_POINTS * 3), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setDrawRange(0, 0);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: DRONE_COLORS[i], transparent: true, opacity: 0.8 }));
    line.frustumCulled = false;
    scene.add(line);
    trails.push({ line, pos, n: 0 });
  }
}
function extendTrails() {
  const swarm = state.swarm;
  for (let i = 0; i < 3; i++) {
    if (swarm.state[i] !== STATE.FLYING) continue;
    const t = trails[i], v = toScene(swarm.px[i], swarm.py[i], swarm.pz[i]);
    if (t.n === TRAIL_POINTS) { t.pos.copyWithin(0, 3); t.n--; }
    t.pos.set([v.x, v.y, v.z], t.n * 3);
    t.n++;
    t.line.geometry.setDrawRange(0, t.n);
    t.line.geometry.attributes.position.needsUpdate = true;
  }
}

// lines between drones: orange when closer than 40 cm, light blue near the 50 cm target, dark when far
const linkPositions = new Float32Array(18), linkColors = new Float32Array(18);
const linkLines = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(linkPositions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(linkColors, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
  m.frustumCulled = false;
  scene.add(m);
  return m;
})();
const LINK_COLORS = { close: new THREE.Color(0xff8f3f), ok: new THREE.Color(0x8fd3ff), far: new THREE.Color(0x2a5a7a) };
function updateLinks() {
  const s = state.swarm;
  let w = 0;
  if (s.options.form !== "none") {
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      if (s.state[i] !== STATE.FLYING || s.state[j] !== STATE.FLYING) continue;
      const d = Math.hypot(s.px[i] - s.px[j], s.py[i] - s.py[j], s.pz[i] - s.pz[j]);
      const a = toScene(s.px[i], s.py[i], s.pz[i]), b = toScene(s.px[j], s.py[j], s.pz[j]);
      linkPositions.set([a.x, a.y, a.z, b.x, b.y, b.z], w);
      const c = d < 0.4 ? LINK_COLORS.close : d < 0.65 ? LINK_COLORS.ok : LINK_COLORS.far;
      linkColors.set([c.r, c.g, c.b, c.r, c.g, c.b], w);
      w += 6;
    }
  }
  linkPositions.fill(0, w); linkColors.fill(0, w);
  linkLines.geometry.attributes.position.needsUpdate = true;
  linkLines.geometry.attributes.color.needsUpdate = true;
}

// a red flash where a drone crashes
const flashes = [];
function flashAt(i) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEXTURES.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.copy(toScene(state.swarm.px[i], state.swarm.py[i], state.swarm.pz[i]));
  s.scale.setScalar(0.2);
  scene.add(s);
  flashes.push({ s, t: 0 });
}
function updateFlashes(dt) {
  for (let k = flashes.length - 1; k >= 0; k--) {
    const f = flashes[k];
    f.t += dt;
    f.s.scale.setScalar(0.2 + f.t * 0.9);
    f.s.material.opacity = Math.max(0, 1 - f.t / 1.2);
    if (f.t > 1.2) { scene.remove(f.s); f.s.material.dispose(); flashes.splice(k, 1); }
  }
}

/** Show or hide the layers chosen in the left panel. */
function applyLayers() {
  if (flowLines) flowLines.visible = state.show.flow;
  if (pressureSlice) pressureSlice.visible = state.show.pressure;
  if (solidCells) solidCells.visible = state.show.cells;
  linkLines.visible = state.show.links;
  airGroup.visible = state.show.air;
  trails.forEach(t => { t.line.visible = state.show.trails; });
}
