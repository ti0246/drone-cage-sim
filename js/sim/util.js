/* =============================================================================
   util.js — small math helpers
   補助関数 — 小さな数学関数
   ============================================================================= */
"use strict";

/** Limit v to the range lo … hi. */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Round to centimetres (sizes are kept to 1 cm). */
function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Repeatable random numbers (mulberry32): the same seed always gives the same
 * sequence, so every run of the comparison test can be reproduced exactly.
 */
function seededRandom(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normally distributed random number, mean 0 and standard deviation 1 (Box–Muller method). */
function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
