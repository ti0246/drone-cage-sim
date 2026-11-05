/* =============================================================================
   cage.js — the flight cage: its size, the take-off and landing areas,
             and the Lighthouse positioning coverage
   ケージ — ネットケージの大きさ、離着陸エリア、Lighthouse測位の届く範囲

   The cage size is changed on the page (left panel, "Cage size").
   ============================================================================= */
"use strict";

/**
 * Current cage size, in metres.
 *   X = length (entrance → target), Y = width, Z = height,
 *   cell = edge of one grid cell of the flow-field method.
 */
const CAGE = { X: 5.5, Y: 3.0, Z: 2.7, cell: 0.1 };

/** Size estimated from the photos of the Aerodynamics Labo cage ("Back to photo estimate"). */
const PHOTO_CAGE = { X: 5.5, Y: 3.0, Z: 2.7, altitude: 1.0 };

/** Allowed range of each cage dimension on the page: [min, max]. */
const CAGE_LIMITS = { X: [3, 10], Y: [2, 6], Z: [1.8, 4] };

/** Change the cage size. The grid becomes coarser only for very large cages (≤ 60,000 cells). */
function setCageSize(X, Y, Z) {
  CAGE.X = X;
  CAGE.Y = Y;
  CAGE.Z = Z;
  CAGE.cell = Math.max(GRID.minCell, Math.ceil(Math.cbrt(X * Y * Z / GRID.maxCells) * 20) / 20);
}

/** Number of cells in the 3D grid. */
function gridCellCount() {
  return Math.round(CAGE.X / CAGE.cell) * Math.round(CAGE.Y / CAGE.cell) * Math.round(CAGE.Z / CAGE.cell);
}

/** Flight altitude allowed in this cage: at least 0.5 m, and 0.6 m below the ceiling at most. */
function clampAltitude(altitude) {
  return clamp(altitude || 1.0, 0.5, CAGE.Z - 0.6);
}

/** Centre of the take-off pads: on the green mat at the entrance. */
function takeoffCentre() {
  return { x: 0.75, y: CAGE.Y / 2 };
}

/** Centre of the landing spots: in front of the target at the far end. */
function landingCentre() {
  return { x: CAGE.X - 0.85, y: CAGE.Y / 2 };
}

/** Circles on the floor where no obstacle may stand (take-off pads and landing spots). */
function keepClearAreas() {
  return [
    { x: 0.75, y: CAGE.Y / 2, r: 0.6 },
    { x: CAGE.X - 0.85, y: CAGE.Y / 2, r: 0.55 },
  ];
}

/* ---------------------------------------------------------------- Lighthouse */

/** Rated range of a Lighthouse V2 base station. */
const LIGHTHOUSE_RANGE = 5;

/** The two base stations hang at opposite top corners of the cage frame. */
function baseStations() {
  const { X, Y, Z } = CAGE;
  return [[0.05, 0.05, Z - 0.08], [X - 0.05, Y - 0.05, Z - 0.08]];
}

/**
 * Largest distance from any point of the flight space to its nearest base station.
 * If this is above LIGHTHOUSE_RANGE, part of the cage is out of positioning range.
 */
function lighthouseReach() {
  const { X, Y, Z } = CAGE, stations = baseStations();
  let worst = 0;
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 8; j++) for (let k = 0; k <= 5; k++) {
    const p = [X * i / 12, Y * j / 8, 0.15 + (Z - 0.3) * k / 5];
    const nearest = Math.min(...stations.map(s => Math.hypot(p[0] - s[0], p[1] - s[1], p[2] - s[2])));
    if (nearest > worst) worst = nearest;
  }
  return worst;
}
