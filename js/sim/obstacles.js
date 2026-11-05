/* =============================================================================
   obstacles.js — the objects placed in the cage
   障害物 — ケージ内に置く物体（種類・寸法・積み重ね・配置のルール・既製の配置）

   An obstacle is a plain object, for example
     { id: 4, type: "box", x: 2.0, y: 1.2, rot: 0, z: 0.72, w: 0.45, d: 0.45, h: 0.45 }
   x, y   centre on the floor plan (m)
   rot    quarter turns, 0–3 (each one is 90° anticlockwise seen from above)
   z      height of the surface it stands on: 0 on the floor, 0.72 on a table, …
          (worked out by settle(): objects rest on the highest flat top under their centre)
   w d h  sizes; when a size is missing, the default of the type is used.

   Fans and air conditioners are obstacles too; their airflow is in airflow.js.
   ============================================================================= */
"use strict";

/**
 * The obstacle library, with real sizes in metres.
 *   sizes    the sizes the user can change: [key, min, max]
 *   flatTop  other objects can be stacked on top (box, box stack, table)
 *   mounted  hangs high in the cage instead of standing on the floor
 *   air      gives airflow: "fan" (round jet) or "aircon" (wide flat jet)
 * Keys: w width, d depth, h height, z0 hanging height, ow / oc gate opening size / centre height,
 *       v wind speed at the outlet (m/s), tilt louver angle below horizontal (°), on switched on.
 */
const OBSTACLE_TYPES = {
  box:    { w: 0.45, d: 0.45, h: 0.45, flatTop: true,
            sizes: [["w", 0.2, 1.0], ["d", 0.2, 1.0], ["h", 0.2, 1.2]] },          // cardboard box
  stack:  { w: 0.45, d: 0.45, h: 1.35, flatTop: true,
            sizes: [["w", 0.3, 0.8], ["d", 0.3, 0.8], ["h", 0.45, 2.7]] },         // stack of boxes in one piece
  pole:   { w: 0.25, d: 0.25, h: 2.2,
            sizes: [["h", 1.0, 4.0]] },                                            // light stand
  chair:  { w: 0.5, d: 0.5, h: 0.85,
            sizes: [["h", 0.7, 1.1]] },                                            // chair
  table:  { w: 1.2, d: 0.6, h: 0.72, flatTop: true,
            sizes: [["w", 0.6, 2.0], ["d", 0.4, 1.0], ["h", 0.5, 1.1]] },          // table
  ball:   { w: 0.65, d: 0.65, h: 0.65,
            sizes: [["h", 0.3, 1.0]] },                                            // exercise ball, h = diameter
  panel:  { w: 1.2, d: 0.05, h: 1.6,
            sizes: [["w", 0.6, 2.4], ["h", 0.8, 4.0]] },                           // partition
  gate:   { w: 1.0, d: 0.05, h: 1.7, ow: 0.6, oc: 1.1,
            sizes: [["w", 0.8, 2.0], ["h", 1.0, 4.0], ["ow", 0.4, 1.2], ["oc", 0.4, 3.0]] },   // ring gate
  bar:    { w: 1.5, d: 0.08, h: 0.12, z0: 1.75, mounted: true,
            sizes: [["w", 0.6, 3.0], ["z0", 0.5, 3.8]] },                          // bar hung from the roof
  fan:    { w: 0.4, d: 0.4, h: 1.1, v: 1.5, on: true, air: "fan",
            sizes: [["h", 0.5, 2.0], ["v", 0.5, 3.0]] },                           // stand fan, h = head height
  aircon: { w: 0.8, d: 0.25, h: 2.3, v: 1.5, tilt: 30, on: true, air: "aircon", mounted: true,
            sizes: [["w", 0.6, 1.2], ["h", 1.0, 3.8], ["v", 0.5, 3.0], ["tilt", 0, 60]] },   // air conditioner, h = mounting height
};

/** A size (or setting) of an obstacle, or the default of its type. */
function size(o, key) {
  return o[key] !== undefined ? o[key] : OBSTACLE_TYPES[o.type][key];
}

/** Quarter turns 0–3, and whether the object is turned sideways (width and depth swapped). */
function quarterTurns(o) {
  return (((o.rot || 0) % 4) + 4) % 4;
}
function isTurned(o) {
  return quarterTurns(o) % 2 === 1;
}

/** Keep every size inside the limits of its type and under the ceiling. */
function clampSizes(o) {
  const type = OBSTACLE_TYPES[o.type], Z = CAGE.Z, base = o.z || 0;
  for (const [key, lo, hi] of type.sizes) {
    let v = size(o, key);
    v = Math.max(lo, Math.min(hi, v));
    if (key === "h" && o.type !== "ball") v = Math.min(v, Z - base);   // not above the ceiling
    if (key === "z0") v = Math.min(v, Z - 0.2);
    o[key] = Math.round(v * 100) / 100;
  }
  if (o.type === "ball") o.h = Math.min(o.h, Z - 0.1 - base);
  if (o.type === "gate") {            // the opening must fit inside the frame
    o.ow = Math.min(o.ow, o.w - 0.1, o.h - 0.15);
    o.oc = Math.max(o.ow / 2 + 0.05, Math.min(o.oc, o.h - o.ow / 2 - 0.05));
  }
  if (o.type === "fan") o.h = Math.min(o.h, round2(Z - base - 0.25));    // the fan head stays below the ceiling
  if (o.type === "aircon") o.h = Math.min(o.h, round2(Z - 0.2));         // the unit stays below the ceiling
  return o;
}

/** Bottom and top of the gate opening, measured from the gate's base. */
function gateOpening(o) {
  const ow = size(o, "ow"), oc = size(o, "oc"), h = size(o, "h");
  return [Math.max(0.05, oc - ow / 2), Math.min(h - 0.05, oc + ow / 2)];
}

/** Size of the object on the floor plan: along x (w) and along y (d). */
function footprint(o) {
  const ball = o.type === "ball";
  const w = ball ? size(o, "h") : size(o, "w");
  const d = ball ? size(o, "h") : size(o, "d");
  return isTurned(o) ? { w: d, d: w } : { w, d };
}

/** Is the centre of object o above the footprint of object s? */
function isOver(o, s) {
  const f = footprint(s);
  return Math.abs(o.x - s.x) <= f.w / 2 + 1e-9 && Math.abs(o.y - s.y) <= f.d / 2 + 1e-9;
}

/** Highest point of the object above the floor. */
function topOf(o) {
  const base = o.z || 0;
  if (o.type === "bar") return size(o, "z0") + size(o, "h");
  if (o.type === "fan") return base + size(o, "h") + 0.2;
  if (o.type === "aircon") return size(o, "h") + 0.15;
  return base + size(o, "h");
}

/**
 * The solid shapes of an obstacle, used by the flow field and by the crash test:
 * axis-aligned boxes { x0, x1, y0, y1, z0, z1 } and spheres { cx, cy, cz, r }.
 */
function solidParts(o) {
  const turned = isTurned(o), base = o.z || 0;
  const w = size(o, "w"), d = size(o, "d"), h = size(o, "h");
  const W = turned ? d : w, D = turned ? w : d;          // extent along x and along y
  const box = (x0, x1, y0, y1, z0, z1) => ({ x0, x1, y0, y1, z0, z1 });
  const centred = (sx, sy, z0, z1) => box(o.x - sx / 2, o.x + sx / 2, o.y - sy / 2, o.y + sy / 2, z0, z1);

  if (o.type === "ball") {
    return { boxes: [], spheres: [{ cx: o.x, cy: o.y, cz: base + h / 2, r: h / 2 }] };
  }
  if (o.type === "gate") {            // two posts, plus the frame below and above the opening
    const hw = w / 2, ho = Math.min(size(o, "ow"), w - 0.1) / 2, t = d / 2, [oz0, oz1] = gateOpening(o);
    const seg = (a0, a1, z0, z1) => turned
      ? box(o.x - t, o.x + t, o.y + a0, o.y + a1, z0, z1)
      : box(o.x + a0, o.x + a1, o.y - t, o.y + t, z0, z1);
    return {
      boxes: [seg(-hw, -ho, base, base + h), seg(ho, hw, base, base + h),
              seg(-ho, ho, base, base + oz0), seg(-ho, ho, base + oz1, base + h)],
      spheres: [],
    };
  }
  if (o.type === "bar") {             // hangs: z0 is the height of its bottom edge
    const z0 = size(o, "z0");
    return { boxes: [centred(W, D, z0, z0 + h)], spheres: [] };
  }
  if (o.type === "fan") {             // base, stand and head (40 cm across the airflow, 22 cm along it)
    const headX = turned ? 0.22 : 0.4, headY = turned ? 0.4 : 0.22;
    return {
      boxes: [centred(0.4, 0.4, base, base + 0.06),
              centred(0.05, 0.05, base + 0.06, base + h - 0.18),
              centred(headX, headY, base + h - 0.2, base + h + 0.2)],
      spheres: [],
    };
  }
  if (o.type === "aircon") {          // the indoor unit, 30 cm tall, centred at the mounting height
    return { boxes: [centred(W, D, h - 0.15, h + 0.15)], spheres: [] };
  }
  return { boxes: [centred(W, D, base, base + h)], spheres: [] };
}

/** All solid shapes of a list of obstacles. */
function obstaclesToSolids(list) {
  const boxes = [], spheres = [];
  for (const o of list) {
    const p = solidParts(o);
    boxes.push(...p.boxes);
    spheres.push(...p.spheres);
  }
  return { boxes, spheres };
}

/* ---------------------------------------------------------------- stacking */

/**
 * The highest flat top (box, box stack or table) under the centre of o, among the
 * first `count` objects of the list. Returns { z: its height, id: its id } or the floor.
 */
function supportUnder(o, list, count) {
  let z = 0, id = 0;
  for (let q = 0; q < count; q++) {
    const s = list[q];
    if (s === o || !OBSTACLE_TYPES[s.type].flatTop || !isOver(o, s)) continue;
    const top = (s.z || 0) + size(s, "h");
    if (top > z + 1e-9) { z = top; id = s.id; }
  }
  return { z: round2(z), id };
}

/**
 * Let every object rest on the highest flat top under its centre. Objects are taken in
 * list order, so an object only rests on objects placed before it: the one you put down
 * last ends up on top. Mounted objects (bar, air conditioner) do not stand on anything.
 */
function settle(list) {
  for (let k = 0; k < list.length; k++) {
    const o = list[k];
    if (OBSTACLE_TYPES[o.type].mounted) { o.z = 0; o.restsOn = 0; continue; }
    const support = supportUnder(o, list, k);
    o.z = support.z;
    o.restsOn = support.id;           // id of the object it stands on, 0 = the floor
    clampSizes(o);                    // a higher base leaves less room under the ceiling
  }
}

/** Everything resting on o, directly or higher up the stack, in list order. */
function objectsOnTop(o, list) {
  const found = new Set([o.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const q of list) if (!found.has(q.id) && found.has(q.restsOn)) { found.add(q.id); grew = true; }
  }
  return list.filter(q => q !== o && found.has(q.id));
}

/* ---------------------------------------------------------------- placement rules */

/** Does the object still fit under the ceiling at its smallest allowed height? */
function fitsUnderCeiling(o) {
  const hRule = OBSTACLE_TYPES[o.type].sizes.find(s => s[0] === "h");
  if (hRule && o.type !== "ball" && size(o, "h") < hRule[1] - 1e-9) return false;
  return topOf(o) <= CAGE.Z + 1e-9;
}

/**
 * Can the object stand here? It must be inside the cage at least 5 cm from the net,
 * keep clear of the take-off pads and the landing spots, and fit under the ceiling.
 */
function isValidSpot(o) {
  const { X, Y } = CAGE, f = footprint(o);
  if (o.x - f.w / 2 < 0.05 || o.x + f.w / 2 > X - 0.05 || o.y - f.d / 2 < 0.05 || o.y + f.d / 2 > Y - 0.05) return false;
  for (const a of keepClearAreas()) {    // nearest point of the footprint to the area centre
    const dx = Math.max(Math.abs(o.x - a.x) - f.w / 2, 0), dy = Math.max(Math.abs(o.y - a.y) - f.d / 2, 0);
    if (dx ** 2 + dy ** 2 < a.r * a.r) return false;
  }
  return fitsUnderCeiling(o);
}

/**
 * Stack the objects, keep them under the ceiling and remove the ones that no longer fit
 * (for example after the cage was made smaller). Returns the removed objects.
 */
function arrangeObstacles(list) {
  const removed = [];
  for (let pass = 0; pass < 10; pass++) {   // removing a support lets the objects above drop down
    for (const o of list) clampSizes(o);
    settle(list);
    const bad = list.filter(o => !isValidSpot(o));
    if (!bad.length) break;
    for (const o of bad) list.splice(list.indexOf(o), 1);
    removed.push(...bad);
  }
  return removed;
}

/* ---------------------------------------------------------------- ready-made layouts */

/**
 * Ready-made layouts. Each one is written as a function of the cage length X and width Y,
 * so it is rebuilt to fit when the cage size changes.
 */
const LAYOUTS = {
  empty: () => [],

  basic: (X, Y) => [
    { type: "stack", x: X * 0.4, y: Y * 0.35 },
    { type: "pole", x: X * 0.55, y: Y * 0.65 },
    { type: "ball", x: X * 0.64, y: Y * 0.3 },
    { type: "box", x: X * 0.3, y: Y * 0.75 },
  ],

  // a ring gate in the middle; partitions close the rest of the width (5 cm from the net)
  gate: (X, Y) => {
    const L = Math.floor((Y / 2 - 0.56) * 100) / 100;
    return [
      { type: "gate", x: X * 0.5, y: Y / 2, rot: 1 },
      { type: "panel", x: X * 0.5, y: 0.06 + L / 2, rot: 1, w: L },
      { type: "panel", x: X * 0.5, y: Y - 0.06 - L / 2, rot: 1, w: L },
    ];
  },

  // two staggered walls, each leaving a 55 cm gap on one side, with a hanging bar over each gap
  maze: (X, Y) => {
    const L = Math.floor((Y - 0.67) / 2 * 100) / 100;
    return [
      { type: "panel", x: X * 0.36, y: 0.06 + L / 2, rot: 1, w: L },
      { type: "panel", x: X * 0.36, y: 0.06 + 1.5 * L, rot: 1, w: L },
      { type: "panel", x: X * 0.64, y: Y - 0.06 - L / 2, rot: 1, w: L },
      { type: "panel", x: X * 0.64, y: Y - 0.06 - 1.5 * L, rot: 1, w: L },
      { type: "bar", x: X * 0.36, y: 0.06 + L, rot: 1 },
      { type: "bar", x: X * 0.64, y: Y - 0.06 - L, rot: 1 },
    ];
  },

  // furniture found in the lab
  mixed: (X, Y) => [
    { type: "table", x: X * 0.37, y: Y * 0.27 },
    { type: "chair", x: X * 0.32, y: Y * 0.62 },
    { type: "pole", x: X * 0.5, y: Y * 0.5 },
    { type: "bar", x: X * 0.62, y: Y * 0.5, rot: 1 },
    { type: "stack", x: X * 0.72, y: Y * 0.22 },
    { type: "ball", x: X * 0.7, y: Y * 0.78 },
  ],

  // stacked objects, a fan blowing across the path and an air conditioner blowing down into the cage
  airflow: (X, Y) => [
    { type: "table", x: X * 0.36, y: Y * 0.24 },
    { type: "box", x: X * 0.36, y: Y * 0.24 },              // on the table
    { type: "box", x: X * 0.66, y: Y * 0.76 },              // a tower of three boxes
    { type: "box", x: X * 0.66, y: Y * 0.76 },
    { type: "box", x: X * 0.66, y: Y * 0.76 },
    { type: "fan", x: X * 0.5, y: Y - 0.3, rot: 2 },        // blows across the drones' path (−y)
    { type: "aircon", x: X * 0.3, y: Y - 0.2, rot: 2 },     // blows into the cage (−y), tilted down
  ],
};

/** Build a ready-made layout for the current cage, with ids 1, 2, 3 … Objects that do not fit are left out. */
function buildLayout(name) {
  let id = 1;
  const list = LAYOUTS[name](CAGE.X, CAGE.Y).map(o => clampSizes({ id: id++, rot: 0, ...o }));
  arrangeObstacles(list);
  return list;
}
