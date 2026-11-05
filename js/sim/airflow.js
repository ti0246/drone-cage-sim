/* =============================================================================
   airflow.js — wind from fans and air conditioners
   気流 — 扇風機とエアコンの風

   Three kinds of air source:
     lab fan         stands outside the net and blows across the cage
                     (switch "Lab fan outside the net" in Room conditions)
     fan             placed in the cage like an obstacle; a round jet
     air conditioner hung high in the cage; a wide, flat jet tilted down by its louver
   Placed fans and air conditioners each have their own on/off switch, direction,
   height and wind speed. A simplified model: the wind pushes a flying drone with
   WIND_PUSH m/s² for every 1 m/s of wind, in the direction the air moves.
   The drones lean against a steady push (swarm.js), and the flow field goes around
   air that is too strong to fly through (flowfield.js).
   ============================================================================= */
"use strict";

/** Push on a drone per 1 m/s of wind (m/s² per m/s). */
const WIND_PUSH = 1.6;

/** Blowing direction (x, y) for each quarter turn: rot 0 blows across the cage towards +y. */
const BLOW_DIRECTIONS = [[0, 1], [-1, 0], [0, -1], [1, 0]];

/** The lab fan: outside the net, at 55 % of the cage length, blowing across the cage. */
function labFan() {
  const { X, Y, Z } = CAGE;
  return { kind: "fan", x: X * 0.55, y: -0.6, z: Math.min(1.1, Z - 0.3), dx: 0, dy: 1, v: 1.2, w: 0.4, len: Y + 0.8, on: true };
}

/** Air sources placed in the cage (fans and air conditioners), read from the obstacle list. */
function placedAirSources(obstacles) {
  const sources = [];
  for (const o of obstacles) {
    const air = OBSTACLE_TYPES[o.type].air;
    if (!air) continue;
    const [dx, dy] = BLOW_DIRECTIONS[quarterTurns(o)];
    if (air === "fan") {
      // the jet starts at the fan head
      sources.push({ kind: "fan", id: o.id, x: o.x, y: o.y, z: (o.z || 0) + size(o, "h"), dx, dy,
                     v: size(o, "v"), w: 0.3, len: 3.0, on: size(o, "on") });
    } else {
      // the jet leaves the front edge of the indoor unit, 10 cm below its centre
      const d = size(o, "d");
      sources.push({ kind: "aircon", id: o.id, x: o.x + dx * d / 2, y: o.y + dy * d / 2, z: size(o, "h") - 0.1, dx, dy,
                     tilt: size(o, "tilt") * Math.PI / 180, v: size(o, "v"), w: size(o, "w"), len: 4.0, on: size(o, "on") });
    }
  }
  return sources;
}

/**
 * Wind speed (m/s) of a fan at the point (x, y, z), at time t.
 * Round jet: the air spreads and slows down with distance; small gusts make it unsteady.
 * With t = null the average speed without gusts is returned.
 */
function fanJet(f, x, y, z, t) {
  const rx = x - f.x, ry = y - f.y, rz = z - f.z;
  const along = rx * f.dx + ry * f.dy;                  // distance downstream of the fan
  if (along < 0 || along > f.len) return 0;
  const side = ry * f.dx - rx * f.dy;                   // sideways distance from the jet axis
  const width = f.w * (1 + along / f.len);              // the jet widens downstream
  const d2 = side * side + rz * rz;
  const steady = f.v * Math.exp(-d2 / (width * width)) * (1 - 0.4 * along / f.len);
  return t === null ? steady : steady * (0.85 + 0.3 * Math.sin(t * 3.1 + x * 4));
}

/** Unit vector along an air-conditioner jet: the blowing direction tilted down by the louver angle. */
function airconAxis(a) {
  const c = Math.cos(a.tilt), s = Math.sin(a.tilt);
  return [a.dx * c, a.dy * c, -s];
}

/**
 * Wind speed (m/s) of an air conditioner at the point (x, y, z), at time t (null = average, no gusts).
 * Flat jet: as wide as the outlet, thin, slowly thickening and slowing down (about 1/√distance).
 */
function airconJet(a, x, y, z, t) {
  const [ux, uy, uz] = airconAxis(a);
  const rx = x - a.x, ry = y - a.y, rz = z - a.z;
  const along = rx * ux + ry * uy + rz * uz;            // distance along the jet
  if (along < 0 || along > a.len) return 0;
  const side = ry * a.dx - rx * a.dy;                   // across the outlet, horizontal
  const s = Math.sin(a.tilt), c = Math.cos(a.tilt);
  const normal = (rx * a.dx + ry * a.dy) * s + rz * c;  // across the jet, in the vertical plane
  const halfWidth = a.w / 2 + 0.15 * along;
  const thickness = 0.08 + 0.18 * along;
  const outside = Math.max(0, Math.abs(side) - halfWidth);
  const profile = Math.exp(-(outside * outside) / 0.04 - (normal * normal) / (thickness * thickness));
  const steady = a.v * profile / Math.sqrt(1 + along / 0.4);
  return t === null ? steady : steady * (0.92 + 0.16 * Math.sin(t * 1.7 + x * 2));
}

/**
 * Wind velocity (m/s) at the point (x, y, z), summed over every source that is on.
 * The result is written into out = [wx, wy, wz].
 */
function windAt(scenario, labFanOn, t, x, y, z, out) {
  out[0] = 0; out[1] = 0; out[2] = 0;
  if (labFanOn) addWind(scenario.labFan, t, x, y, z, out);
  for (const src of scenario.air) if (src.on) addWind(src, t, x, y, z, out);
}

function addWind(src, t, x, y, z, out) {
  if (src.kind === "fan") {
    const speed = fanJet(src, x, y, z, t);
    out[0] += speed * src.dx;
    out[1] += speed * src.dy;
  } else {
    const speed = airconJet(src, x, y, z, t), axis = airconAxis(src);
    out[0] += speed * axis[0];
    out[1] += speed * axis[1];
    out[2] += speed * axis[2];
  }
}

/**
 * Average wind speed (m/s, no gusts) of the placed fans and air conditioners that are on.
 * The flow field uses it to go around air that is too strong for a drone (see flowfield.js).
 */
function steadyWindSpeed(scenario, x, y, z) {
  const w = [0, 0, 0];
  for (const src of scenario.air) if (src.on) addWind(src, null, x, y, z, w);
  return Math.hypot(w[0], w[1], w[2]);
}
