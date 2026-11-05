/* =============================================================================
   swarm.js — the three drones: one control step every 0.02 s
   3機のドローン — 0.02秒ごとの制御ステップ

   The command of each drone is an acceleration made of three parts:
     1. Navigation   where to go: follow the virtual flow (2019 patent, grid method),
                     or head straight for the target (used for comparison).
     2. Interaction  keep 50 cm from the 2 nearest drones: a virtual spring–damper
                     (2019 patent, particle method) or the learned table a = f(r, v)
                     (2022 patent).
     3. Safety layer always acts last: push away from obstacles and the net, keep the
                     drones apart, and move out of the air pushed down under another drone.
                     It also leans against the wind: each drone estimates the steady push of
                     wind and downwash from how it moves, and cancels it (like the integral
                     term of the Crazyflie's own position controller).
   Parts 1 + 2 are limited to 65 % of the maximum acceleration first, so the safety
   layer always has room to act.

   Mission: take-off → transit → 2 s hover at the target → landing on three spots.
   A run is a success when all three drones land and nothing collided.
   ============================================================================= */
"use strict";

/** Drone states. */
const STATE = { FLYING: 0, CRASHED: 2, LANDED: 3 };

const FLOW = [0, 0, 0];   // scratch vectors, reused every step
const WIND = [0, 0, 0];

class Swarm {
  /**
   * @param scenario from buildScenario(): obstacles, air sources, start and goal
   * @param field    from solveFlowField()
   * @param table    the learned table, POLICY_TABLE
   * @param options  { nav: "flow" | "direct", form: "rl" | "spring" | "none", labFan: bool, noise: bool,
   *                   windCompensation: bool (default true) }
   * @param seed     random seed: small take-off errors and the sensor noise
   */
  constructor(scenario, field, table, options, seed) {
    this.scenario = scenario;
    this.field = field;
    this.table = table;
    this.options = Object.assign({ nav: "flow", form: "rl", labFan: false, noise: false, windCompensation: true }, options || {});
    this.cruiseHeight = scenario.altitude || 1.0;
    this.rng = seededRandom(seed || 1);
    this.reset();
  }

  /** Put the drones back on their pads. */
  reset() {
    const n = DRONE.count, sc = this.scenario;
    this.t = 0;
    this.phase = "takeoff";            // takeoff → transit → land → done
    this.allArrivedAt = -1;            // time when every drone still flying had reached the target
    this.doneAt = -1;                  // time when every drone still flying had landed
    for (const key of ["px", "py", "pz", "vx", "vy", "vz", "ax", "ay", "az", "pushX", "pushY", "pushZ", "energy", "downwashTime"]) {
      this[key] = new Float64Array(n); // position, velocity, commanded acceleration, estimated push, Wh used, s in downwash
    }
    this.state = new Uint8Array(n);    // STATE.FLYING, CRASHED or LANDED
    this.arrived = new Uint8Array(n);  // 1 once the drone has reached the target
    this.arrivedAt = new Float64Array(n).fill(-1);
    this.droneCollisions = 0;          // drones lost in drone–drone collisions
    this.obstacleCrashes = 0;          // drones lost on an obstacle, the net or the floor
    this.minSeparation = Infinity;     // closest pair now
    this.minSeparationEver = Infinity; // closest pair during transit and landing
    this.events = [];                  // { t, type: "arr" | "land" | "dd" | "obs" | "net" | "floor", i, j }
    this.history = { t: [], minSep: [], z: [[], [], []] };   // for the charts, every 5th step
    this.pads = [];                    // take-off pads [x, y]
    this.spots = [];                   // landing spots [x, y]
    for (let i = 0; i < n; i++) {
      const a = i * 2 * Math.PI / n, R = 0.3;
      this.pads.push([sc.start.x + R * Math.cos(a) * 0.9, sc.start.y + R * Math.sin(a)]);
      this.px[i] = this.pads[i][0] + gaussian(this.rng) * 0.02;   // a few cm of placement error
      this.py[i] = this.pads[i][1] + gaussian(this.rng) * 0.02;
      this.pz[i] = 0.03;
      const b = Math.PI + i * 2 * Math.PI / n;
      this.spots.push([sc.goal.x + 0.28 * Math.cos(b) * 0.9, sc.goal.y + 0.28 * Math.sin(b)]);
    }
  }

  /** One control step of 0.02 s for all drones. */
  step() {
    const notCrashed = [];
    for (let i = 0; i < DRONE.count; i++) if (this.state[i] !== STATE.CRASHED) notCrashed.push(i);
    this.updatePhase(notCrashed);
    for (let i = 0; i < DRONE.count; i++) this.computeCommand(i, notCrashed);
    this.moveDrones();
    const minSep = this.checkSeparation();
    this.checkProgress(notCrashed, minSep);
  }

  updatePhase(notCrashed) {
    if (this.phase === "takeoff" && this.t > TIME.takeoff) this.phase = "transit";
    if (this.phase === "transit" && notCrashed.length && notCrashed.every(i => this.arrived[i])) {
      if (this.allArrivedAt < 0) this.allArrivedAt = this.t;
      if (this.t - this.allArrivedAt > TIME.hoverAtTarget) this.phase = "land";
    }
  }

  /** The commanded acceleration of drone i: navigation + interaction + safety layer. */
  computeCommand(i, notCrashed) {
    const sc = this.scenario, opt = this.options, { px, py, pz, vx, vy, vz } = this;
    if (this.state[i] === STATE.CRASHED) { this.fall(i); return; }
    if (this.state[i] === STATE.LANDED) {
      vx[i] = vy[i] = vz[i] = 0;
      this.ax[i] = this.ay[i] = this.az[i] = 0;
      return;
    }

    /* ---- 1. Navigation -------------------------------------------------------------- */
    let dirX = 0, dirY = 0, dirZ = 0, speed = DRONE.cruiseSpeed, ax, ay, az;
    const gx = sc.goal.x - px[i], gy = sc.goal.y - py[i], gz = sc.goal.z - pz[i];
    const goalDist = Math.hypot(gx, gy, gz);
    if (this.phase === "land") {
      // fly over the own landing spot, then come down slowly
      const [sx, sy] = this.spots[i], hx = sx - px[i], hy = sy - py[i], hd = Math.hypot(hx, hy);
      const wantVz = hd < 0.15 ? (pz[i] > 0.25 ? -0.35 : -0.15) : 0, kp = hd > 0.4 ? 1.5 : 4;
      ax = clamp(kp * hx, -1.5, 1.5) - 2.8 * vx[i];
      ay = clamp(kp * hy, -1.5, 1.5) - 2.8 * vy[i];
      az = DRONE.navGain * (wantVz - vz[i]);
      if (pz[i] < 0.04 && hd < 0.2) {
        this.state[i] = STATE.LANDED;
        pz[i] = 0.02;
        this.events.push({ t: this.t, type: "land", i });
        return;
      }
    } else {
      if (this.phase === "takeoff") {                                   // straight up
        dirZ = pz[i] < this.cruiseHeight * 0.8 ? 1 : 0;
        speed = 0.5;
      } else if (goalDist < 0.6 || opt.nav === "direct") {              // straight to the goal
        dirX = gx / goalDist; dirY = gy / goalDist; dirZ = gz / goalDist;
      } else if (flowDirectionAt(this.field, px[i], py[i], pz[i], FLOW) > 0) {   // follow the virtual flow
        dirX = FLOW[0]; dirY = FLOW[1]; dirZ = FLOW[2];
      } else {
        dirX = gx / goalDist; dirY = gy / goalDist; dirZ = gz / goalDist;
      }
      if (this.phase === "transit") speed *= clamp((goalDist - 0.08) / 0.5, 0, 1);   // slow down at the target
      ax = DRONE.navGain * (dirX * speed - vx[i]);
      ay = DRONE.navGain * (dirY * speed - vy[i]);
      az = DRONE.navGain * (dirZ * speed - vz[i]);
      if (this.phase === "transit" && opt.nav === "flow") az += 0.3 * clamp(this.cruiseHeight - pz[i], -1, 1);   // hold altitude
    }

    /* ---- 2. Interaction with the nearest drones --------------------------------------- */
    // what drone i measures about the others (optionally with noise and lost packets)
    const neighbours = [];
    for (const j of notCrashed) {
      if (j === i || this.state[j] === STATE.LANDED) continue;
      let rx = px[i] - px[j], ry = py[i] - py[j], rz = pz[i] - pz[j];
      if (opt.noise) {
        rx += gaussian(this.rng) * SENSING.noise;
        ry += gaussian(this.rng) * SENSING.noise;
        rz += gaussian(this.rng) * SENSING.noise;
        if (this.rng() < SENSING.packetLoss) continue;
      }
      neighbours.push({ r: Math.hypot(rx, ry, rz), rx, ry, rz, j });
    }
    neighbours.sort((a, b) => a.r - b.r);

    if (opt.form !== "none" && this.phase === "transit") {
      const step = learnedStep(this.table, SPACING.target);   // m/s² of one table action
      let farX = 0, farY = 0, farZ = 0, farCount = 0;
      for (let q = 0; q < Math.min(SPACING.neighbours, neighbours.length); q++) {
        const { r, rx, ry, rz, j } = neighbours[q];
        const ex = rx / Math.max(r, 1e-6), ey = ry / Math.max(r, 1e-6), ez = rz / Math.max(r, 1e-6);   // unit vector j → i
        const vr = (vx[i] - vx[j]) * ex + (vy[i] - vy[j]) * ey + (vz[i] - vz[j]) * ez;           // + moving apart
        if (opt.form === "spring") {
          // 2019 patent: virtual spring–damper, three times stiffer when too close
          if (r > 1.7 * SPACING.target) continue;
          const stretch = r - SPACING.target, k = stretch < 0 ? 3 * SPACING.springK : SPACING.springK;
          const mag = -k * stretch - SPACING.springDamping * vr;
          ax += mag * ex; ay += mag * ey; az += mag * ez;
        } else {
          // 2022 patent: learned table, +1 = move apart, −1 = move closer
          let a = learnedAction(this.table, r, vr, SPACING.target);
          if (r < SAFETY.minSeparation) a = 1;
          if (r < SPACING.target) {             // too close: react to each neighbour
            ax += a * step * ex; ay += a * step * ey; az += a * step * ez;
          } else {                              // far: average the pulls of the neighbours
            farX += a * step * ex; farY += a * step * ey; farZ += a * step * ez; farCount++;
          }
        }
      }
      if (farCount) { ax += farX / farCount; ay += farY / farCount; az += farZ / farCount; }
    }

    // parts 1 + 2 use at most 65 % of the acceleration budget
    const aMax = DRONE.maxAccel, budget = 0.65 * aMax, a12 = Math.hypot(ax, ay, az);
    if (a12 > budget) { ax *= budget / a12; ay *= budget / a12; az *= budget / a12; }

    /* ---- 3. Safety layer ------------------------------------------------------------- */
    // push away from a surface at distance d (direction ddx, ddy, ddz), and brake when moving towards it
    const range = SAFETY.obstacleRange;
    const repel = (ddx, ddy, ddz, d) => {
      if (d >= range || d < 1e-6) return;
      const nx = ddx / d, ny = ddy / d, nz = ddz / d, mag = Math.min(3 * aMax, 0.6 * aMax * (range / d - 1));
      ax += mag * nx; ay += mag * ny; az += mag * nz;
      const vn = vx[i] * nx + vy[i] * ny + vz[i] * nz;
      if (vn < 0) {
        const kb = 3 * (1 - d / range);
        ax -= kb * vn * nx; ay -= kb * vn * ny; az -= kb * vn * nz;
      }
    };
    for (const b of sc.boxes) {          // nearest point of each solid box
      const cx = clamp(px[i], b.x0, b.x1), cy = clamp(py[i], b.y0, b.y1), cz = clamp(pz[i], b.z0, b.z1);
      repel(px[i] - cx, py[i] - cy, pz[i] - cz, Math.hypot(px[i] - cx, py[i] - cy, pz[i] - cz));
    }
    for (const s of sc.spheres) {        // nearest point of each ball
      const ddx = px[i] - s.cx, ddy = py[i] - s.cy, ddz = pz[i] - s.cz, dc = Math.hypot(ddx, ddy, ddz), d = dc - s.r;
      if (dc > 1e-6) repel(ddx / dc * d, ddy / dc * d, ddz / dc * d, d);
    }
    if (opt.form !== "none" && this.phase !== "takeoff") {
      for (const { r, rx, ry, rz, j } of neighbours) {
        if (r < SAFETY.minSeparation) {  // too close to another drone: push apart and stop closing in
          const rr = Math.max(r, 0.03), ex = rx / rr, ey = ry / rr, ez = rz / rr;
          const mag = Math.min(3 * aMax, aMax * (SAFETY.minSeparation / rr - 1));
          ax += mag * ex; ay += mag * ey; az += mag * ez;
          const vn = (vx[i] - vx[j]) * ex + (vy[i] - vy[j]) * ey + (vz[i] - vz[j]) * ez;
          if (vn < 0) { ax -= 2 * vn * ex; ay -= 2 * vn * ey; az -= 2 * vn * ez; }
        }
        const hd = Math.hypot(rx, ry);  // under another drone: move sideways out of its downwash
        if (rz < 0 && -rz < SAFETY.downwashDepth && hd < SAFETY.downwashRadius) {
          const h = Math.max(hd, 0.02), push = aMax * 0.8 * (1 - hd / SAFETY.downwashRadius);
          ax += push * rx / h; ay += push * ry / h; az -= 0.3 * push;
        }
      }
    }
    const takingOffOrLanding = this.phase === "takeoff" || this.phase === "land";
    if (!takingOffOrLanding && pz[i] < SAFETY.minCruiseHeight) az += 4 * (SAFETY.minCruiseHeight - pz[i]);   // off the floor
    // the net acts like a soft wall: ceiling, entrance end, target end, both sides
    const { X, Y, Z } = CAGE;
    repel(0, 0, -(Z - pz[i]), Z - pz[i]);
    repel(px[i], 0, 0, px[i]);
    repel(-(X - px[i]), 0, 0, X - px[i]);
    repel(0, py[i], 0, py[i]);
    repel(0, -(Y - py[i]), 0, Y - py[i]);
    // lean against the push the drone has noticed (wind, downwash)
    if (opt.windCompensation) { ax -= this.pushX[i]; ay -= this.pushY[i]; az -= this.pushZ[i]; }
    const total = Math.hypot(ax, ay, az);
    if (total > aMax) { ax *= aMax / total; ay *= aMax / total; az *= aMax / total; }
    this.ax[i] = ax; this.ay[i] = ay; this.az[i] = az;
  }

  /** A crashed drone drops to the floor. */
  fall(i) {
    const dt = TIME.step, { px, py, pz, vx, vy, vz } = this;
    if (pz[i] > 0.02) {
      vz[i] -= 9.81 * dt; vx[i] *= 0.97; vy[i] *= 0.97;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] = Math.max(0.02, pz[i] + vz[i] * dt);
    } else vx[i] = vy[i] = vz[i] = 0;
    this.ax[i] = this.ay[i] = this.az[i] = 0;
  }

  /** Apply wind and downwash, update the estimated push, move the flying drones, use battery energy, detect crashes. */
  moveDrones() {
    const n = DRONE.count, dt = TIME.step, { X, Y, Z } = CAGE, { px, py, pz, vx, vy, vz } = this;
    const dwRadius = SAFETY.downwashRadius * 0.7;
    for (let i = 0; i < n; i++) {
      if (this.state[i] !== STATE.FLYING) continue;
      let ax = this.ax[i], ay = this.ay[i], az = this.az[i];
      // wind from the lab fan, placed fans and air conditioners
      windAt(this.scenario, this.options.labFan, this.t, px[i], py[i], pz[i], WIND);
      ax += WIND_PUSH * WIND[0]; ay += WIND_PUSH * WIND[1]; az += WIND_PUSH * WIND[2];
      let pushDown = 0;
      // air pushed down by a drone flying above
      for (let j = 0; j < n; j++) {
        if (j === i || this.state[j] !== STATE.FLYING) continue;
        const dz = pz[j] - pz[i], hd = Math.hypot(px[i] - px[j], py[i] - py[j]);
        if (dz > 0 && dz < SAFETY.downwashDepth && hd < dwRadius) {
          az -= 3.0 * (1 - hd / dwRadius);
          pushDown += 3.0 * (1 - hd / dwRadius);
          this.downwashTime[i] += dt;
        }
      }
      // the drone notices the outside push after a short delay (first-order filter, WIND_HANDLING.observerLag)
      const k = dt / WIND_HANDLING.observerLag;
      this.pushX[i] += k * (WIND_PUSH * WIND[0] - this.pushX[i]);
      this.pushY[i] += k * (WIND_PUSH * WIND[1] - this.pushY[i]);
      this.pushZ[i] += k * (WIND_PUSH * WIND[2] - pushDown - this.pushZ[i]);
      // velocity, then position
      vx[i] += ax * dt; vy[i] += ay * dt; vz[i] += az * dt;
      const v = Math.hypot(vx[i], vy[i], vz[i]);
      if (v > DRONE.maxSpeed) { vx[i] *= DRONE.maxSpeed / v; vy[i] *= DRONE.maxSpeed / v; vz[i] *= DRONE.maxSpeed / v; }
      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] = Math.max(0.02, pz[i] + vz[i] * dt);
      // battery: power grows with thrust^1.5 (thrust in units of the drone's weight)
      const thrust = Math.hypot(this.ax[i], this.ay[i], this.az[i] + 9.81) / 9.81;
      this.energy[i] += DRONE.hoverPower * Math.pow(thrust, 1.5) * dt / 3600;
      // crashes
      if (insideSolid(this.scenario, px[i], py[i], pz[i], DRONE.armRadius)) this.crash(i, "obs");
      else if (px[i] < 0.05 || px[i] > X - 0.05 || py[i] < 0.05 || py[i] > Y - 0.05 || pz[i] > Z - 0.05) this.crash(i, "net");
      else if (this.phase === "transit" && pz[i] < 0.05) this.crash(i, "floor");
    }
  }

  crash(i, type) {
    this.state[i] = STATE.CRASHED;
    this.obstacleCrashes++;
    this.events.push({ t: this.t, type, i });
  }

  /** Distance of the closest pair, and drone–drone collisions. Returns the closest distance now. */
  checkSeparation() {
    const n = DRONE.count, { px, py, pz } = this;
    let minSep = Infinity;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (this.state[i] === STATE.CRASHED || this.state[j] === STATE.CRASHED) continue;
      const d = Math.hypot(px[i] - px[j], py[i] - py[j], pz[i] - pz[j]);
      if (d < minSep) minSep = d;
      if (d < SAFETY.collision && this.state[i] === STATE.FLYING && this.state[j] === STATE.FLYING) {
        this.state[i] = this.state[j] = STATE.CRASHED;
        this.droneCollisions += 2;
        this.events.push({ t: this.t, type: "dd", i, j });
      }
    }
    if (this.phase === "transit" || this.phase === "land") this.minSeparationEver = Math.min(this.minSeparationEver, minSep);
    return minSep;
  }

  /** Arrivals at the target, end of the mission, clock and chart history. */
  checkProgress(notCrashed, minSep) {
    const n = DRONE.count, sc = this.scenario, { px, py, pz } = this;
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      if (this.state[i] === STATE.CRASHED) continue;
      const dist = Math.hypot(px[i] - sc.goal.x, py[i] - sc.goal.y, pz[i] - sc.goal.z);
      if (!this.arrived[i] && dist < sc.goalRadius + SPACING.target) {
        this.arrived[i] = 1;
        this.arrivedAt[i] = this.t;
        this.events.push({ t: this.t, type: "arr", i });
      }
      if (this.arrived[i]) arrived++;
    }
    const landed = notCrashed.filter(i => this.state[i] === STATE.LANDED).length;
    if (this.doneAt < 0 && notCrashed.length && landed === notCrashed.length) {
      this.doneAt = this.t;
      this.phase = "done";
    }
    this.t += TIME.step;
    this.minSeparation = minSep;
    this.arrivedCount = arrived;
    this.landedCount = landed;
    if (Math.round(this.t / TIME.step) % 5 === 0) {
      this.history.t.push(this.t);
      this.history.minSep.push(isFinite(minSep) ? minSep : null);
      for (let i = 0; i < 3; i++) this.history.z[i].push(this.state[i] === STATE.CRASHED ? null : pz[i]);
    }
  }

  /** Result of a run, for the comparison test. */
  summary() {
    const n = DRONE.count, crashes = this.droneCollisions + this.obstacleCrashes;
    return {
      done: this.doneAt >= 0,
      success: this.doneAt >= 0 && crashes === 0 && this.landedCount === n,
      missionTime: this.doneAt >= 0 ? this.doneAt : null,
      crashes,
      minSeparation: this.minSeparationEver,
      energy: Array.from(this.energy).reduce((a, b) => a + b, 0) / n,     // Wh per drone
      downwashTime: Array.from(this.downwashTime).reduce((a, b) => a + b, 0),
    };
  }
}
