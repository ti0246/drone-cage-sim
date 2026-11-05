/* =============================================================================
   flowfield.js — the grid method of patent WO 2019/131557
   格子法（WO 2019/131557）— 3D格子上の仮想圧力から、目標へ向かう流れ場を作る

   1. Split the cage into small cubes (cells), 10 cm by default.
   2. Mark the cells taken by obstacles, plus a 10 cm margin, as solid.
   3. Fix a virtual pressure: p = 1 on the entrance side, p = 0 around the goal.
   4. Solve Laplace's equation ∇²p = 0 in the free cells: every free cell becomes
      the average of its free neighbours. Solved by successive over-relaxation (SOR).
   5. The flow direction is the direction in which p falls fastest, −∇p.
      A solution of Laplace's equation has no local minimum inside the free space,
      so following the flow always leads to the goal, around the solid cells.

   Added by this project: cells where a fan or an air conditioner blows harder than a
   drone can fight are treated like solid cells too, so the flow goes around strong air.
   If that would close every way to the goal, those cells stay open.
   ============================================================================= */
"use strict";

/** Is the point (x, y, z) inside an obstacle that is grown by `margin` on every side? */
function insideSolid(scenario, x, y, z, margin) {
  for (const b of scenario.boxes) {
    if (x > b.x0 - margin && x < b.x1 + margin &&
        y > b.y0 - margin && y < b.y1 + margin &&
        z > b.z0 - margin && z < b.z1 + margin) return true;
  }
  for (const s of scenario.spheres) {
    if (Math.hypot(x - s.cx, y - s.cy, z - s.cz) < s.r + margin) return true;
  }
  return false;
}

/** Steps 1–5 above. Returns the grid with the pressure p and the flow direction (U, V, W) of every cell. */
function solveFlowField(scenario) {
  const { X, Y, Z, cell: dx } = CAGE;
  const nx = Math.round(X / dx), ny = Math.round(Y / dx), nz = Math.round(Z / dx), n = nx * ny * nz;
  const index = (i, j, k) => (k * ny + j) * nx + i;      // cell (i, j, k) → position in the arrays
  const free = new Uint8Array(n);                        // 1 = air, 0 = solid
  const fixed = new Uint8Array(n);                       // 1 = the pressure is fixed (boundary condition)
  const p = new Float64Array(n);                         // virtual pressure
  const goal = scenario.goal, goalRadius = Math.max(0.25, 1.3 * dx);

  // Steps 1–3: solid cells, fixed pressures, and a first guess everywhere else
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (i + 0.5) * dx, y = (j + 0.5) * dx, z = (k + 0.5) * dx, c = index(i, j, k);
    free[c] = insideSolid(scenario, x, y, z, GRID.margin) ? 0 : 1;
    if (free[c] && Math.hypot(x - goal.x, y - goal.y, z - goal.z) < goalRadius) { fixed[c] = 1; p[c] = 0; }  // goal: lowest
    else if (free[c] && i === 0) { fixed[c] = 1; p[c] = 1; }                                                 // entrance: highest
    else p[c] = Math.min(1, Math.hypot(x - goal.x, y - goal.y) / X);                                         // first guess
  }

  // Strong air from fans and air conditioners counts as solid, when a way to the goal remains
  const windy = markStrongWind(scenario, { nx, ny, nz, dx, index }, free, fixed);

  // Step 4: SOR sweeps. Solid neighbours are left out, so no air flows into an obstacle.
  const omega = GRID.sorOmega, layer = nx * ny;
  for (let sweep = 0; sweep < GRID.sorSweeps; sweep++) {
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = index(i, j, k);
      if (!free[c] || fixed[c]) continue;
      let sum = 0, count = 0;
      if (i > 0 && free[c - 1]) { sum += p[c - 1]; count++; }
      if (i < nx - 1 && free[c + 1]) { sum += p[c + 1]; count++; }
      if (j > 0 && free[c - nx]) { sum += p[c - nx]; count++; }
      if (j < ny - 1 && free[c + nx]) { sum += p[c + nx]; count++; }
      if (k > 0 && free[c - layer]) { sum += p[c - layer]; count++; }
      if (k < nz - 1 && free[c + layer]) { sum += p[c + layer]; count++; }
      if (count) p[c] += omega * (sum / count - p[c]);   // move past the average (over-relaxation)
    }
  }

  // Step 5: flow = −∇p, from central differences (one-sided next to a solid cell), as unit vectors
  const U = new Float32Array(n), V = new Float32Array(n), W = new Float32Array(n);
  const slope = (c, cm, cp, hasM, hasP) => {
    const a = hasM && free[cm], b = hasP && free[cp];
    if (a && b) return (p[cp] - p[cm]) / (2 * dx);
    if (b) return (p[cp] - p[c]) / dx;
    if (a) return (p[c] - p[cm]) / dx;
    return 0;
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = index(i, j, k);
    if (!free[c]) continue;
    U[c] = -slope(c, c - 1, c + 1, i > 0, i < nx - 1);
    V[c] = -slope(c, c - nx, c + nx, j > 0, j < ny - 1);
    W[c] = -slope(c, c - layer, c + layer, k > 0, k < nz - 1);
    const length = Math.hypot(U[c], V[c], W[c]);
    if (length > 0) { U[c] /= length; V[c] /= length; W[c] /= length; }
  }
  return { nx, ny, nz, dx, p, free, windy, U, V, W, index };
}

/**
 * Mark the free cells whose average wind is stronger than a drone can fight
 * (push above WIND_HANDLING.avoidAbove × the maximum acceleration) and make them solid,
 * but only if the take-off point can still reach the goal through calm cells.
 * Returns the array of marked cells (all zero when nothing was marked).
 */
function markStrongWind(scenario, grid, free, fixed) {
  const { nx, ny, nz, dx, index } = grid, n = nx * ny * nz, layer = nx * ny;
  const windy = new Uint8Array(n);
  if (!scenario.air.some(s => s.on)) return windy;
  const limit = WIND_HANDLING.avoidAbove * DRONE.maxAccel / WIND_PUSH;     // m/s of wind
  let marked = false;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = index(i, j, k);
    if (free[c] && !fixed[c] && steadyWindSpeed(scenario, (i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dx) > limit) {
      windy[c] = 1;
      marked = true;
    }
  }
  if (!marked) return windy;

  // flood fill from the goal through free, calm cells
  const reached = new Uint8Array(n), stack = [];
  for (let c = 0; c < n; c++) if (fixed[c] && free[c] && (c % nx) !== 0) { reached[c] = 1; stack.push(c); }   // goal cells
  while (stack.length) {
    const c = stack.pop(), i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / layer);
    const neighbours = [[i > 0, c - 1], [i < nx - 1, c + 1], [j > 0, c - nx], [j < ny - 1, c + nx], [k > 0, c - layer], [k < nz - 1, c + layer]];
    for (const [inside, cc] of neighbours) {
      if (inside && !reached[cc] && free[cc] && !windy[cc]) { reached[cc] = 1; stack.push(cc); }
    }
  }
  const start = index(Math.floor(scenario.start.x / dx), Math.floor(scenario.start.y / dx), Math.min(nz - 1, Math.floor(scenario.altitude / dx)));
  if (!reached[start]) { windy.fill(0); return windy; }         // no calm way: fly through the wind
  for (let c = 0; c < n; c++) if (windy[c]) free[c] = 0;
  return windy;
}

/**
 * Flow direction at any point, blended from the 8 surrounding cells (trilinear interpolation).
 * Writes the unit vector into out = [ux, uy, uz] and returns the blended length (0 = no flow here).
 */
function flowDirectionAt(field, x, y, z, out) {
  const { nx, ny, nz, dx } = field;
  const fx = Math.max(0, Math.min(nx - 1.001, x / dx - 0.5));
  const fy = Math.max(0, Math.min(ny - 1.001, y / dx - 0.5));
  const fz = Math.max(0, Math.min(nz - 1.001, z / dx - 0.5));
  const i = fx | 0, j = fy | 0, k = fz | 0, ax = fx - i, ay = fy - j, az = fz - k;
  let u = 0, v = 0, w = 0;
  for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
    const c = field.index(i + di, j + dj, k + dk);
    const weight = (di ? ax : 1 - ax) * (dj ? ay : 1 - ay) * (dk ? az : 1 - az);
    u += weight * field.U[c];
    v += weight * field.V[c];
    w += weight * field.W[c];
  }
  const length = Math.hypot(u, v, w);
  if (length < 1e-6) { out[0] = out[1] = out[2] = 0; return 0; }
  out[0] = u / length; out[1] = v / length; out[2] = w / length;
  return length;
}
