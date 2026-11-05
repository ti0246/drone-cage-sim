/* =============================================================================
   models.js — 3D models of the obstacles and of the Crazyflie drone
   3Dモデル — 障害物（扇風機・エアコンを含む）とCrazyflieの形

   Models are built from the real sizes. Local frame of an obstacle model:
   width along x, depth along z, the surface it stands on at y = 0.
   Fans and air conditioners blow towards local −z (the +y direction of the cage at rot 0).
   ============================================================================= */
"use strict";

const OBSTACLE_MATERIALS = {
  card: new THREE.MeshStandardMaterial({ color: 0xb98d58, roughness: 0.95 }),
  cardTape: new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x2b3035, roughness: 0.45, metalness: 0.7 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xf1f1ec, emissive: 0x666655, roughness: 0.4 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x3a4a6b, roughness: 0.8 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xb8bfc4, roughness: 0.3, metalness: 0.9 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf0f1f1, roughness: 0.6 }),
  ball: new THREE.MeshStandardMaterial({ color: 0x3d8f9e, roughness: 0.35 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x3157a8, roughness: 0.95 }),
  frame: new THREE.MeshStandardMaterial({ color: 0xbfc4c8, roughness: 0.5, metalness: 0.4 }),
  gate: new THREE.MeshStandardMaterial({ color: 0xff8f3f, roughness: 0.55, emissive: 0x3a1600, emissiveIntensity: 0.5 }),
  fanBody: new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }),
  fanBlade: new THREE.MeshStandardMaterial({ color: 0x7fb8d6, roughness: 0.4, transparent: true, opacity: 0.85 }),
  acBody: new THREE.MeshStandardMaterial({ color: 0xf3f5f6, roughness: 0.45 }),
  acSlot: new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.8 }),
};

/** Add a box (w × h × d) centred at (x, y, z) to group g. */
function addBox(g, w, h, d, x, y, z, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
/** Add an upright cylinder (radius r, height h) centred at (x, y, z) to group g. */
function addCylinder(g, r, h, x, y, z, material, segments = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** Build the 3D model of one obstacle. */
function obstacleModel(o) {
  const g = new THREE.Group(), M = OBSTACLE_MATERIALS;
  const w = size(o, "w"), d = size(o, "d"), h = size(o, "h");

  if (o.type === "box" || o.type === "stack") {          // brown boxes with a strip of tape
    const n = o.type === "box" ? 1 : Math.max(1, Math.round(h / 0.45)), bh = h / n;
    for (let k = 0; k < n; k++) {
      const y = k * bh + bh / 2;
      addBox(g, w, bh - 0.004, d, (k % 2) * 0.01, y, 0, M.card);
      addBox(g, Math.min(0.07, w * 0.2), bh - 0.002, d + 0.002, 0, y, 0, M.cardTape);
    }
  } else if (o.type === "pole") {                        // tripod light stand
    for (let k = 0; k < 3; k++) {
      const a = k * 2.094, leg = addBox(g, 0.02, 0.02, 0.32, Math.cos(a) * 0.1, 0.06, Math.sin(a) * 0.1, M.steel);
      leg.rotation.y = -a + Math.PI / 2; leg.rotation.x = 0.35;
    }
    addCylinder(g, 0.016, h - 0.2, 0, (h - 0.2) / 2, 0, M.steel);
    addBox(g, 0.22, 0.18, 0.2, 0, h - 0.09, 0, M.lamp);
  } else if (o.type === "chair") {
    const s = h / 0.85;
    addBox(g, 0.46, 0.05, 0.44, 0, 0.45 * s, 0, M.seat);
    addBox(g, 0.46, 0.4 * s, 0.04, 0, (0.47 + 0.2) * s, -0.21, M.seat);
    for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) addCylinder(g, 0.012, 0.45 * s, x, 0.225 * s, z, M.chrome);
  } else if (o.type === "table") {
    addBox(g, w, 0.03, d, 0, h - 0.015, 0, M.white);
    for (const [x, z] of [[-w / 2 + 0.04, -d / 2 + 0.04], [w / 2 - 0.04, -d / 2 + 0.04], [-w / 2 + 0.04, d / 2 - 0.04], [w / 2 - 0.04, d / 2 - 0.04]]) {
      addCylinder(g, 0.018, h - 0.03, x, (h - 0.03) / 2, z, M.chrome);
    }
  } else if (o.type === "ball") {
    const s = new THREE.Mesh(new THREE.SphereGeometry(h / 2, 32, 20), M.ball);
    s.position.y = h / 2; s.castShadow = true;
    g.add(s);
  } else if (o.type === "panel") {                       // blue partition in a light frame, on two feet
    addBox(g, w - 0.03, h - 0.12, 0.04, 0, h / 2 + 0.03, 0, M.panel);
    addBox(g, w, 0.04, 0.05, 0, h - 0.02, 0, M.frame);
    for (const x of [-w / 2, w / 2]) addBox(g, 0.03, h, 0.05, x, h / 2, 0, M.frame);
    for (const x of [-w * 0.37, w * 0.37]) addBox(g, 0.05, 0.03, 0.4, x, 0.015, 0, M.frame);
  } else if (o.type === "gate") {                        // drawn from the same solid boxes the simulation uses
    const parts = solidParts({ ...o, x: 0, y: 0, z: 0, rot: 0 });
    parts.boxes.forEach((b, k) => addBox(g, b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2,
                                         -(b.y0 + b.y1) / 2, k < 2 ? M.steel : M.gate));
  } else if (o.type === "bar") {                         // bar on two thin wires from the roof
    const z0 = size(o, "z0");
    addBox(g, w, h, d, 0, z0 + h / 2, 0, M.steel);
    for (const x of [-w * 0.4, w * 0.4]) addCylinder(g, 0.004, Math.max(0.01, CAGE.Z - z0 - h), x, (CAGE.Z + z0 + h) / 2, 0, M.steel, 4);
  } else if (o.type === "fan") {
    buildFanModel(g, o, h);
  } else if (o.type === "aircon") {
    buildAirconModel(g, o, w, d, h);
  }
  return g;
}

/** Stand fan: cross base, pole, motor, guard ring and three blades that spin when it runs. */
function buildFanModel(g, o, h) {
  const M = OBSTACLE_MATERIALS;
  addBox(g, 0.4, 0.03, 0.05, 0, 0.03, 0, M.fanBody);
  addBox(g, 0.05, 0.03, 0.4, 0, 0.03, 0, M.fanBody);
  addCylinder(g, 0.015, h - 0.16, 0, (h - 0.16) / 2 + 0.03, 0, M.chrome);
  const motor = addCylinder(g, 0.06, 0.12, 0, h, 0.08, M.fanBody, 16);
  motor.rotation.x = Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.008, 6, 40), M.chrome);
  ring.position.set(0, h, 0);
  g.add(ring);
  const blades = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.008), M.fanBlade);
    blade.position.set(Math.cos(k * 2.094) * 0.09, Math.sin(k * 2.094) * 0.09, 0);
    blade.rotation.z = k * 2.094;
    blades.add(blade);
  }
  blades.position.set(0, h, 0);
  g.add(blades);
  g.userData.blades = blades;
}

/** Indoor air-conditioner unit hung from the roof; the louver shows the angle of the air. */
function buildAirconModel(g, o, w, d, h) {
  const M = OBSTACLE_MATERIALS;
  addBox(g, w, 0.3, d, 0, h, 0, M.acBody);
  addBox(g, w * 0.86, 0.05, 0.012, 0, h - 0.1, -d / 2 - 0.004, M.acSlot);      // outlet at the front bottom
  const louver = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 0.006, 0.07), M.acBody);
  louver.position.set(0, h - 0.13, -d / 2 - 0.03);
  louver.rotation.x = size(o, "tilt") * Math.PI / 180;                         // tilted down by the louver angle
  g.add(louver);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: size(o, "on") ? 0x3ddc97 : 0x4a5258 }));
  led.position.set(w / 2 - 0.06, h + 0.07, -d / 2 - 0.002);
  g.add(led);
  for (const x of [-w * 0.35, w * 0.35]) addCylinder(g, 0.006, Math.max(0.01, CAGE.Z - h - 0.15), x, (CAGE.Z + h + 0.15) / 2, 0, M.steel, 6);
}

/* ---------------------------------------------------------------- Crazyflie 2.1 Brushless (100 mm frame, 55 mm propellers) */

/** The drones are drawn 2.5 times larger than real, so they stay visible in the whole cage. */
const DRONE_DRAW_SCALE = 2.5;

const DRONE_GEOMETRY = {
  pcb: new THREE.BoxGeometry(0.034, 0.0016, 0.034), arm: new THREE.BoxGeometry(0.052, 0.004, 0.006),
  motor: new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 12), disc: new THREE.CircleGeometry(0.0275, 24),
  blade: new THREE.BoxGeometry(0.055, 0.0008, 0.006), deck: new THREE.BoxGeometry(0.026, 0.0014, 0.026),
  sensor: new THREE.BoxGeometry(0.004, 0.002, 0.004), battery: new THREE.BoxGeometry(0.03, 0.007, 0.016),
  led: new THREE.SphereGeometry(0.0022, 8, 6), leg: new THREE.CylinderGeometry(0.0012, 0.0012, 0.014, 6),
};
const DRONE_MATERIALS = {
  pcb: new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.5, metalness: 0.3 }),
  arm: new THREE.MeshStandardMaterial({ color: 0x23282d, roughness: 0.6 }),
  motor: new THREE.MeshStandardMaterial({ color: 0x8a939b, roughness: 0.3, metalness: 0.8 }),
  disc: new THREE.MeshBasicMaterial({ color: 0xd9e3ea, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  blade: new THREE.MeshStandardMaterial({ color: 0x1a1d20 }),
  deck: new THREE.MeshStandardMaterial({ color: 0x1b5e3a, roughness: 0.5 }),       // Lighthouse deck
  sensor: new THREE.MeshStandardMaterial({ color: 0x0b0c0d }),
  battery: new THREE.MeshStandardMaterial({ color: 0x6f7b85, roughness: 0.5 }),
  crashed: new THREE.MeshStandardMaterial({ color: 0x5a2224 }),
};

/** One Crazyflie: board, battery, Lighthouse deck with 4 sensors, 4 arms, motors and propellers, coloured LEDs. */
function droneModel(i) {
  const G = DRONE_GEOMETRY, M = DRONE_MATERIALS;
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const pcb = new THREE.Mesh(G.pcb, M.pcb); pcb.castShadow = true; body.add(pcb);
  const battery = new THREE.Mesh(G.battery, M.battery); battery.position.y = -0.005; body.add(battery);
  const deck = new THREE.Mesh(G.deck, M.deck); deck.position.y = 0.006; body.add(deck);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const s = new THREE.Mesh(G.sensor, M.sensor); s.position.set(sx * 0.01, 0.0075, sz * 0.01); body.add(s);
  }
  const props = [];
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz], k) => {
    const x = sx * 0.0354, z = sz * 0.0354;
    const arm = new THREE.Mesh(G.arm, M.arm); arm.position.set(x / 2, 0, z / 2); arm.rotation.y = -Math.atan2(z, x); body.add(arm);
    const motor = new THREE.Mesh(G.motor, M.motor); motor.position.set(x, 0.004, z); body.add(motor);
    const leg = new THREE.Mesh(G.leg, M.arm); leg.position.set(x, -0.008, z); body.add(leg);
    const disc = new THREE.Mesh(G.disc, M.disc); disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.011, z); body.add(disc);
    const blade = new THREE.Mesh(G.blade, M.blade); blade.position.set(x, 0.011, z);
    blade.userData.dir = k % 3 === 0 ? 1 : -1;        // diagonal propellers turn the same way
    body.add(blade);
    props.push(blade);
  });
  const ledMaterial = new THREE.MeshBasicMaterial({ color: DRONE_COLORS[i] });
  for (const [x, z] of [[0.012, 0.016], [-0.012, 0.016]]) { const l = new THREE.Mesh(G.led, ledMaterial); l.position.set(x, 0.002, z); body.add(l); }
  const glowMaterial = new THREE.SpriteMaterial({ map: TEXTURES.glow, color: DRONE_COLORS[i], transparent: true,
                                                  blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 });
  const glow = new THREE.Sprite(glowMaterial); glow.scale.setScalar(0.09); body.add(glow);
  g.scale.setScalar(DRONE_DRAW_SCALE);
  g.userData = { props, ledMaterial, glowMaterial, pcb, yaw: 0 };
  return g;
}
