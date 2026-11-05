/* =============================================================================
   config.js — every model parameter in one place
   設定値 — モデルのパラメータをすべてこのファイルにまとめています

   Units: metres (m), seconds (s), m/s and m/s².
   Coordinates inside the cage:
     x = along the cage, from the entrance (x = 0) to the target end
     y = across the cage
     z = height above the floor
   ============================================================================= */
"use strict";

/** The drone: Crazyflie 2.1 Brushless (100 mm frame, 34 g). */
const DRONE = {
  count: 3,             // drones in the swarm
  cruiseSpeed: 0.45,    // m/s, normal travel speed
  maxSpeed: 1.2,        // m/s
  maxAccel: 2.5,        // m/s², the largest acceleration the controller may ask for
  navGain: 2.2,         // 1/s, how quickly the velocity follows the wanted velocity
  armRadius: 0.06,      // m, an obstacle closer than this to the drone's centre is a crash
  hoverPower: 7.8,      // W, electrical power while hovering (estimate)
  batteryWh: 1.3,       // Wh, energy of the 350 mAh battery
};

/** Spacing between the drones (the particle method of both patents). */
const SPACING = {
  target: 0.5,          // m, wanted distance between neighbours (r0)
  neighbours: 2,        // each drone reacts to its 2 nearest drones
  springK: 8,           // 1/s², stiffness of the virtual spring (2019 patent)
  springDamping: 2.5,   // 1/s, virtual damper (2019 patent)
  learnedGain: 3,       // multiplies the acceleration step of the learned table (2022 patent)
};

/** Safety layer. Added by this project; it acts the same way for every method. */
const SAFETY = {
  obstacleRange: 0.35,  // m, obstacles and the net push a drone back inside this distance
  minSeparation: 0.28,  // m, two drones closer than this are pushed apart
  collision: 0.12,      // m, two drones closer than this collide (propellers touch)
  downwashRadius: 0.25, // m, radius of the air pushed down under a drone
  downwashDepth: 0.7,   // m, how far below a drone that air reaches
  minCruiseHeight: 0.35 // m, drones stay above this height while travelling
};

/** Position measurement errors (switch "Position noise and radio loss"). */
const SENSING = {
  noise: 0.02,          // m, standard deviation of the measured position of another drone
  packetLoss: 0.1,      // share of radio packets that are lost (10 %)
};

/** Time. */
const TIME = {
  step: 0.02,           // s, one control step (50 per second)
  maxSteps: 3000,       // a run stops after 60 s
  takeoff: 2.2,         // s, length of the take-off phase
  hoverAtTarget: 2.0,   // s, hover in front of the target before landing
};

/** The 3D grid of the flow-field method (2019 patent). */
const GRID = {
  minCell: 0.1,         // m, size of one grid cell (larger only for very large cages)
  maxCells: 60000,      // keeps the pressure solve under one second
  margin: 0.15,         // m, safety margin added around every obstacle (keeps the flow lines away from surfaces)
  sorOmega: 1.9,        // over-relaxation factor of the SOR solver
  sorSweeps: 700,       // number of SOR sweeps over the grid
};

/** Handling of wind from fans and air conditioners (added by this project). */
const WIND_HANDLING = {
  observerLag: 0.3,     // s, how quickly a drone notices a steady push (wind, downwash) and leans against it
  avoidAbove: 0.6,      // the flow field goes around air whose push is above 60 % of the maximum acceleration
};
