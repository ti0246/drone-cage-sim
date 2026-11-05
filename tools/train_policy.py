"""
train_policy.py — learn the behaviour table of patent JP 2022-147373 A
行動表の学習（特開2022-147373：仮想相互作用力を用いた強化学習、Q学習）

Two drones on a line. The state (r, v) is their distance r and how fast it changes, v.
An action is a relative acceleration: +A (move apart), 0 (keep) or -A (move closer).
A virtual spring-damper is placed between the two drones:

    F = -k (r - r0) - c v          (the "virtual interaction force")

The reward is high when |F| is small, i.e. when the drones sit at the distance r0 and do
not drift. After training, the best action of every (r, v) cell is written into a table,
js/sim/policy-table.js, which every drone looks up during flight (js/sim/policy.js).

The patent trains a deep Q-network (DQN). The state here has only two numbers, so a plain
Q-table on a 51 x 41 grid learns the same behaviour and can be inspected cell by cell.
The random seed is fixed, so running this script again gives exactly the same table.

Run:  python tools/train_policy.py        (needs numpy; takes a few minutes)
"""
import os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_FILE = os.path.join(HERE, "..", "js", "sim", "policy-table.js")
rng = np.random.default_rng(1)

# ---------------------------------------------------------------- parameters
r0 = 3.0                   # m, wanted distance during training (the simulation rescales it to 0.5 m)
k_spring, c_damp = 1.0, 1.5   # virtual spring and damper, used only to compute the reward
A = 1.5                    # m/s^2, acceleration of one action
dt = 0.1                   # s, time step of training
ACTIONS = np.array([+1, 0, -1])
F_OK, V_OK = 0.15, 0.15    # "settled": small force and small speed

R_MIN, R_MAX, NR = 0.0, 10.0, 51     # distance axis of the table
V_MIN, V_MAX, NV = -3.0, 3.0, 41     # speed axis of the table


def virtual_force(r, v):
    return -k_spring * (r - r0) - c_damp * v


def cell(r, v):
    """Table cell (row, column) of a state."""
    i = int(np.clip(np.round((r - R_MIN) / (R_MAX - R_MIN) * (NR - 1)), 0, NR - 1))
    j = int(np.clip(np.round((v - V_MIN) / (V_MAX - V_MIN) * (NV - 1)), 0, NV - 1))
    return i, j


def step(r, v, a):
    """Move the pair for one time step with action a; return the new state, the reward and whether the episode ends."""
    v = v + a * A * dt
    r = r + v * dt
    F = virtual_force(r, v)
    done = abs(F) < F_OK and abs(v) < V_OK
    reward = -abs(F) * 0.5 - 0.05            # small |F| is good; every step costs a little
    if done:
        reward = 10.0
    if r < 0.5:                              # far too close: large penalty, but keep going so it learns to separate
        r, v = 0.5, max(v, 0.0)
        reward, done = -20.0, False
    if r > R_MAX:                            # drifted away
        reward, done = -10.0, True
    return r, v, reward, done


# ---------------------------------------------------------------- Q-learning
Q = np.zeros((NR, NV, 3))
alpha, gamma = 0.2, 0.97
EPISODES, MAX_STEPS = 25000, 300
returns = []

for episode in range(EPISODES):
    epsilon = max(0.05, 1.0 - episode / (0.7 * EPISODES))     # explore a lot at first, then less
    r, v = rng.uniform(0.5, 9.5), rng.uniform(-2.8, 2.8)       # random start
    total = 0.0
    for t in range(MAX_STEPS):
        s = cell(r, v)
        a_index = rng.integers(3) if rng.random() < epsilon else int(np.argmax(Q[s]))
        r, v, reward, done = step(r, v, ACTIONS[a_index])
        s2 = cell(r, v)
        target = reward + (0 if done else gamma * Q[s2].max())
        Q[s][a_index] = (1 - alpha) * Q[s][a_index] + alpha * target
        total += reward
        if done:
            break
    returns.append(total)

# ---------------------------------------------------------------- the table a = f(r, v)
policy = ACTIONS[np.argmax(Q, axis=2)]        # best action of every cell, shape (51, 41)
curve = [round(float(np.mean(returns[k:k + 250])), 2) for k in range(0, EPISODES, 250)]

lines = [
    "/* =============================================================================",
    "   policy-table.js — the learned behaviour table (data only)",
    "   学習済みの行動表（データ）— tools/train_policy.py が作成。手で編集しないでください。",
    "",
    "   Made by tools/train_policy.py (Q-learning on one pair of drones, 25,000 episodes).",
    "   Do not edit by hand: run the training script again to make a new table.",
    "",
    "   policy[row][column] is the action for a distance r and a closing speed v:",
    "     row    = distance r between the two drones, 51 steps from 0 to 10 m (0.2 m apart)",
    "     column = rate of change of r, 41 steps from -3 to +3 m/s (0.15 m/s apart)",
    "     value  = +1 move apart, 0 keep, -1 move closer (a relative acceleration of A m/s²)",
    "   The table was trained for a spacing r0 = 3 m; policy.js rescales it to the 0.5 m used here.",
    "   ============================================================================= */",
    '"use strict";',
    "",
    "const POLICY_TABLE = {",
    f"  r0: {r0},         // m, spacing used in training",
    f"  A: {A},          // m/s², acceleration of one action in training",
    f"  r: [{R_MIN}, {R_MAX}],  // m, range of the distance axis (rows)",
    f"  v: [{V_MIN}, {V_MAX}],  // m/s, range of the closing-speed axis (columns)",
    "  policy: [",
]
for i, row in enumerate(policy):
    r_value = R_MIN + (R_MAX - R_MIN) * i / (NR - 1)
    lines.append("    [" + ",".join("%2d" % x for x in row) + f"],   // r = {r_value:.1f} m")
lines += [
    "  ],",
    "  // training progress: average return of every 250 episodes (rises as the table improves)",
    "  curve: [" + ", ".join(str(x) for x in curve) + "],",
    "};",
]
with open(OUT_FILE, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
print("wrote", os.path.normpath(OUT_FILE))
print("average return, first 250 episodes:", curve[0], " last 250:", curve[-1])
