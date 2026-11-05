/* =============================================================================
   scenario.js — everything one flight needs
   シナリオ — 1回の飛行に必要な情報（固体形状・気流・離陸地点・目標）をまとめる
   ============================================================================= */
"use strict";

/**
 * @param obstacles the obstacle list (see obstacles.js)
 * @param altitude  flight altitude in metres (cruise height and height of the goal)
 */
function buildScenario(obstacles, altitude) {
  const solids = obstaclesToSolids(obstacles), alt = clampAltitude(altitude);
  return {
    boxes: solids.boxes,                   // solid boxes of all obstacles
    spheres: solids.spheres,               // solid spheres (exercise balls)
    air: placedAirSources(obstacles),      // placed fans and air conditioners
    labFan: labFan(),                      // the fan outside the net
    altitude: alt,
    start: takeoffCentre(),                // centre of the three take-off pads
    goal: { ...landingCentre(), z: alt },  // point in front of the target
    goalRadius: 0.3,                       // m, size of the goal area
  };
}
