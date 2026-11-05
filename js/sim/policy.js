/* =============================================================================
   policy.js — patent JP 2022-147373 A: reinforcement learning with a virtual
               interaction force, used through a lookup table a = f(r, v)
   特開2022-147373 — 仮想相互作用力を用いた強化学習。学習結果を表 a = f(r, v) として使う

   How the table was made (tools/train_policy.py):
     state   (r, v) = distance between two drones and how fast it changes
     action  +1 move apart, 0 keep, −1 move closer (a relative acceleration)
     reward  high when a virtual spring–damper placed between the two drones is relaxed,
             i.e. the drones sit at the wanted distance and do not drift
   As the patent describes, the learned model is turned into a table ("functionalised"),
   so a drone only needs one lookup per neighbour; no neural network runs during flight.
   ============================================================================= */
"use strict";

/**
 * The learned action for distance r (m) and closing speed v (m/s, positive when moving apart).
 * The table was trained at spacing table.r0 (3 m); r and v are rescaled to the spacing used here.
 */
function learnedAction(table, r, v, spacing) {
  const scale = table.r0 / spacing;
  const rows = table.policy.length, cols = table.policy[0].length;
  const i = clamp(Math.round((r * scale - table.r[0]) / (table.r[1] - table.r[0]) * (rows - 1)), 0, rows - 1);
  const j = clamp(Math.round((v * scale - table.v[0]) / (table.v[1] - table.v[0]) * (cols - 1)), 0, cols - 1);
  return table.policy[i][j];
}

/** Size of one action in m/s²: the training acceleration, rescaled, times SPACING.learnedGain. */
function learnedStep(table, spacing) {
  return table.A * (spacing / table.r0) * SPACING.learnedGain;
}
