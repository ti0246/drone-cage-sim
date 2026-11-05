/* =============================================================================
   i18n.js — every text on the page, in English and Japanese
   表示テキスト — 英語と日本語

   Elements with data-i18n="key" get their text from here when the language changes.
   ============================================================================= */
"use strict";

const TEXTS = {
  en: {
    title: "Aerodynamics Labo Drone Cage",
    subtitle: "3 Crazyflie drones · virtual flow field + reinforcement learning",
    foot: "Implements WO 2019/131557 and JP 2022-147373 A (Cluster Dynamics).",

    // left panel
    secRun: "Run", pause: "Pause", play: "Resume", reset: "Fly again", speed: "Simulation speed",
    secCage: "Cage size", secCageHint: "type a value or drag",
    cageX: "Length (entrance → target)", cageY: "Width", cageZ: "Height", alt: "Flight altitude",
    cageReset: "Back to photo estimate",
    lhOk: d => `Lighthouse: every point within <b>${d} m</b> of a base station (rated range 5 m).`,
    lhBad: d => `Lighthouse: farthest point <b>${d} m</b> from a base station, beyond the 5 m rated range.`,
    secNav: "Guidance", secNavHint: "where to go",
    navFlow: "Virtual flow field", navFlowD: "Pressure on a 3D grid; drones drift with the flow to the target",
    navDirect: "Straight to the target", navDirectD: "Head straight for the goal, dodge obstacles locally",
    secForm: "Spacing", secFormHint: "between the 3 drones",
    formRL: "Reinforcement learning", formRLD: "Learned table a = f(r, v), no hand tuning",
    formSpring: "Virtual springs", formSpringD: "Spring–damper force, hand-tuned gains",
    formNone: "No interaction", formNoneD: "Each drone flies on its own",
    secEnv: "Room conditions",
    labFan: "Lab fan outside the net", labFanD: "about 1.2 m/s across the cage",
    noise: "Position noise and radio loss", noiseD: "σ 2 cm, 10% of packets lost",
    windComp: "Drones lean against the wind", windCompD: "each drone estimates the push and cancels it",
    airTitle: "Fans and air conditioners in the cage",
    airNone: "None yet. Add a fan or an air conditioner from the bar under the 3D view.",
    blow: ["blows to the far side", "blows towards the entrance", "blows to the near side", "blows towards the target"],
    louver: "louver",
    secShow: "Layers",
    showCells: "Grid cells taken by obstacles", showPressure: "Virtual pressure at flight altitude", showFlow: "Virtual flow",
    showAir: "Air from fans and air conditioners", showLinks: "Links between drones", showSafety: "Safety zone around each drone",
    showDownwash: "Downwash zones", showTrails: "Flight trails",
    camera: "Camera", camOrbit: "Free", camFollow: "Follow", camTop: "Top", camDoor: "From door",

    // 3D view
    hudTime: "Time", lgFlow: "Virtual flow", lgAir: "Air from fans and air conditioners",
    lgLink: "Too close → push apart", lgDw: "Downwash zone",
    scale: (x, y, z) => `Cage ${x} × ${y} × ${z} m · drones drawn ×2.5`,
    howTitle: "How it works", stepAll: "Show all",
    steps: [
      ["Grid", "The cage is split into small cells (10 cm). Orange cells are taken by obstacles, plus a 15 cm margin. Blue cells have wind stronger than a drone can fight; the flow goes around them."],
      ["Pressure", "Virtual pressure is high at the entrance (orange) and low in front of the target (blue). Black = obstacle, light blue = strong wind."],
      ["Flow", "Each drone follows the direction in which pressure falls fastest: the moving blue lines."],
      ["Interaction", "Lines between drones: orange = too close and pushing apart, light blue = normal 50 cm spacing."],
      ["Safety", "Spheres = each drone's safety zone. Purple cones = downwash under each drone, which the others avoid."],
      ["Mission", "Take-off, transit, a 2 s hover at the target, then landing on three marked spots."],
    ],

    // obstacle bar
    layouts: "Layouts", layoutEmpty: "Empty", layoutBasic: "Basic", layoutGate: "Ring gate", layoutMaze: "Maze",
    layoutMixed: "Real furniture", layoutAirflow: "Stacks and airflow",
    addTitle: "Add", editTitle: "Edit",
    toolSelect: "Select / drag", toolRotate: "Rotate 90°", toolDelete: "Delete selected", toolClear: "Clear all",
    names: { box: "Cardboard box", stack: "Box stack", pole: "Light stand", chair: "Chair", table: "Table", ball: "Exercise ball",
             panel: "Partition", gate: "Ring gate", bar: "Hanging bar", fan: "Fan", aircon: "Air conditioner" },
    sizes: { w: "Width", d: "Depth", h: "Height", z0: "Hanging height", ow: "Opening size", oc: "Opening height",
             v: "Wind speed", tilt: "Louver angle", len: "Length", dia: "Diameter", head: "Head height",
             mount: "Mounting height", x: "Position x", y: "Position y" },
    onFloor: "On the floor",
    onTop: (name, z) => `On top of the ${name.toLowerCase()}, ${z} m up`,
    mountedAt: h => `Mounted at ${h} m`,
    hangsAt: z => `Hangs from the roof at ${z} m`,
    running: "Running",
    hintIdle: "Pick an object above, then click the cage floor to place it, or click the top of a box, box stack or table to stack it there. Turn on <b>Select / drag</b> to move, resize or delete. Keys: <kbd>R</kbd> rotate, <kbd>Del</kbd> delete, <kbd>Esc</kbd> stop.",
    hintPlace: t => `Placing: <b>${t}</b>. Click the floor, or the top of a box, box stack or table to stack it (green = allowed; red = on the take-off or landing area, too close to the net, or no room under the ceiling). <kbd>R</kbd> rotates, <kbd>Esc</kbd> stops.`,
    hintSelect: "Click an object to select it, then drag to move it. Objects stacked on it move with it. The flow field is recomputed when you let go.",
    hintSel: t => `Selected: <b>${t}</b>. Drag to move it, or type exact values below. <kbd>R</kbd> rotate, <kbd>Del</kbd> delete.`,
    badPlace: "Not allowed here: on the take-off or landing area, too close to the net, or no room under the ceiling.",

    // right panel
    secPhase: "Mission phase", phTakeoff: "Take-off", phTransit: "Transit", phLand: "Landing", phDone: "Done",
    secLive: "Live telemetry", tileLand: "Landed at target", tileCrash: "Collisions", tileSep: "Closest pair", tileObs: "Obstacles",
    secDrones: "Each drone", stFly: "flying", stArr: "at target", stLanded: "landed", stDead: "fell", stPad: "on pad", battery: "battery",
    chartSep: "Closest distance between two drones", chartSepTouch: "props touch at 12 cm", chartSepTarget: "target 50 cm",
    chartAlt: "Altitude of each drone", secLog: "Event log",

    // event log
    evTakeoff: "Take-off from 3 pads on the entrance mat",
    evArrive: (t, i) => `<b>${t}s</b> CF${i} reached the target`,
    evLand: (t, i) => `<b>${t}s</b> CF${i} landed`,
    evDone: t => `<b>${t}s</b> Done: all 3 drones landed`,
    evCollide: (t, i, j) => `<b>${t}s</b> CF${i} collided with CF${j}`,
    evObstacle: (t, i) => `<b>${t}s</b> CF${i} hit an obstacle`,
    evNet: (t, i) => `<b>${t}s</b> CF${i} touched the net`,
    evFloor: (t, i) => `<b>${t}s</b> CF${i} touched the floor`,
    evEdit: t => `<b>${t}s</b> Obstacles changed — flow field recomputed`,
    evAir: (t, name, on) => `<b>${t}s</b> ${name} switched ${on ? "on" : "off"}`,
    evAirChange: (t, name) => `<b>${t}s</b> ${name}: airflow changed`,
    evLayout: s => `Layout: ${s}`, custom: "custom",
    evTrim: (k, n) => `Layout fitted to this cage: ${k} of ${n} objects kept (the rest had no room)`,
    recalc: "Recomputing the flow field…",
    loading: n => `Computing the 3D pressure field (${n.toLocaleString("en-US")} cells)…`,

    // comparison test
    cmpTitle: "Comparison test", cmpRun: "Run the comparison", cmpRunning: "Running…", on: "on", off: "off",
    cmpDesc: (n, k, w, z, x, y, h, c) => `Four setups fly the current cage (${x} × ${y} × ${h} m, ${n} obstacles, ${k} fans or air conditioners running, lab fan ${w}, noise ${z}, leaning against the wind ${c}) 10 times each, with take-off positions shifted by a few cm. Success = all three drones land with no collision.`,
    cmpFoot: "Green = best and red = worst in each column. Closest pair, time and energy are compared only among setups that succeed in at least 80% of runs. Click a row to fly that setup in 3D.",
    setupA: "Flow field + reinforcement learning", setupAs: "both patents",
    setupB: "Flow field + virtual springs", setupBs: "2019 patent",
    setupC: "Flow field, no interaction", setupCs: "without the particle method",
    setupD: "Straight line + reinforcement learning", setupDs: "without the grid method",
    colSetup: "Setup", colSuccess: "Success", colCrash: "Collisions", colSep: "Closest pair", colTime: "Mission time", colEnergy: "Energy",
    unitSuccess: "% of runs", unitCrash: "drones per run", unitSep: "cm", unitTime: "s", unitEnergy: "mWh per drone",
  },

  ja: {
    title: "エアロダイナミクス実験室 ドローンケージ",
    subtitle: "Crazyflie 3機 · 仮想流れ場 + 強化学習",
    foot: "実装した特許：WO 2019/131557、特開2022-147373（Cluster Dynamics）。",

    secRun: "操作", pause: "一時停止", play: "再開", reset: "再飛行", speed: "再生速度",
    secCage: "ケージのサイズ", secCageHint: "数値を入力またはドラッグ",
    cageX: "長さ（入口 → 的）", cageY: "幅", cageZ: "高さ", alt: "飛行高度",
    cageReset: "写真からの推定値に戻す",
    lhOk: d => `Lighthouse：すべての地点がベースステーションから <b>${d} m</b> 以内（定格範囲 5 m）。`,
    lhBad: d => `Lighthouse：最も遠い地点がベースステーションから <b>${d} m</b>、定格範囲 5 m を超えます。`,
    secNav: "誘導", secNavHint: "行き先",
    navFlow: "仮想流れ場", navFlowD: "3D格子上の圧力。機体は流れに乗って的へ向かう",
    navDirect: "的へ直進", navDirectD: "目的地へ直進し、障害物はその場で回避",
    secForm: "間隔維持", secFormHint: "3機の間",
    formRL: "強化学習", formRLD: "学習済みの表 a = f(r, v)、手動調整不要",
    formSpring: "仮想ばね", formSpringD: "ばね・ダンパ力、係数は手動調整",
    formNone: "相互作用なし", formNoneD: "各機が独立して飛行",
    secEnv: "室内条件",
    labFan: "ネット外の扇風機", labFanD: "ケージを横切る約1.2 m/s",
    noise: "測位雑音・無線パケット損失", noiseD: "σ 2 cm、10%損失",
    windComp: "風に逆らって飛ぶ（風の補正）", windCompD: "各機が風の力を推定して打ち消す",
    airTitle: "ケージ内の扇風機とエアコン",
    airNone: "まだありません。3D画面の下のバーから扇風機やエアコンを追加できます。",
    blow: ["奥側へ送風", "入口側へ送風", "手前側へ送風", "的の方へ送風"],
    louver: "ルーバー",
    secShow: "表示レイヤー",
    showCells: "障害物が占める格子セル", showPressure: "飛行高度の仮想圧力", showFlow: "仮想流れ",
    showAir: "扇風機・エアコンの風", showLinks: "機体間リンク", showSafety: "機体周りの安全領域",
    showDownwash: "ダウンウォッシュ領域", showTrails: "飛行軌跡",
    camera: "カメラ", camOrbit: "自由", camFollow: "追従", camTop: "真上", camDoor: "入口から",

    hudTime: "時間", lgFlow: "仮想流れ", lgAir: "扇風機・エアコンの風",
    lgLink: "接近 → 斥力", lgDw: "ダウンウォッシュ",
    scale: (x, y, z) => `ケージ ${x} × ${y} × ${z} m · 機体は2.5倍表示`,
    howTitle: "仕組み", stepAll: "すべて表示",
    steps: [
      ["格子", "ケージを小さなセル（10 cm）に分割。オレンジのセルは障害物（+余裕15 cm）が占める部分。青いセルは機体が逆らえないほど風が強い所で、流れはそこを避けます。"],
      ["圧力", "仮想圧力は入口で高く（オレンジ）、的の前で低い（青）。黒＝障害物、水色＝強い風。"],
      ["流れ", "各機は圧力が最も速く下がる方向へ進む：流れる青い線。"],
      ["相互作用", "機体間の線：オレンジ＝接近しすぎで離れる、薄い青＝通常の50 cm間隔。"],
      ["安全層", "球＝各機の安全領域。紫の円錐＝各機の下のダウンウォッシュ。他機はここを避ける。"],
      ["ミッション", "離陸、移動、的の前で2秒ホバリング、3つの印に着陸。"],
    ],

    layouts: "配置", layoutEmpty: "空", layoutBasic: "基本", layoutGate: "リングゲート", layoutMaze: "迷路",
    layoutMixed: "実際の家具", layoutAirflow: "積み重ねと気流",
    addTitle: "追加", editTitle: "編集",
    toolSelect: "選択 / 移動", toolRotate: "90°回転", toolDelete: "選択を削除", toolClear: "すべて削除",
    names: { box: "段ボール箱", stack: "箱の山", pole: "ライトスタンド", chair: "椅子", table: "机", ball: "バランスボール",
             panel: "パーティション", gate: "リングゲート", bar: "吊りバー", fan: "扇風機", aircon: "エアコン" },
    sizes: { w: "幅", d: "奥行き", h: "高さ", z0: "吊り下げ高さ", ow: "開口サイズ", oc: "開口の高さ",
             v: "風速", tilt: "ルーバー角度", len: "長さ", dia: "直径", head: "ヘッドの高さ",
             mount: "取り付け高さ", x: "位置 x", y: "位置 y" },
    onFloor: "床に設置",
    onTop: (name, z) => `${name}の上（高さ ${z} m）`,
    mountedAt: h => `高さ ${h} m に取り付け`,
    hangsAt: z => `天井から高さ ${z} m に吊り下げ`,
    running: "運転",
    hintIdle: "上で物体を選び、ケージの床をクリックして配置。箱・箱の山・机の上面をクリックすると、その上に積み重ねます。<b>選択 / 移動</b>で移動・サイズ変更・削除。キー：<kbd>R</kbd> 回転、<kbd>Del</kbd> 削除、<kbd>Esc</kbd> 終了。",
    hintPlace: t => `配置中：<b>${t}</b>。床、または箱・箱の山・机の上面をクリック（緑＝配置可、赤＝離着陸エリア上・ネットに近すぎる・天井までの高さが足りない）。<kbd>R</kbd> 回転、<kbd>Esc</kbd> 終了。`,
    hintSelect: "物体をクリックして選択し、ドラッグで移動。上に積んだ物体も一緒に動きます。離すと流れ場が再計算されます。",
    hintSel: t => `選択中：<b>${t}</b>。ドラッグで移動、または下で数値を入力。<kbd>R</kbd> 回転、<kbd>Del</kbd> 削除。`,
    badPlace: "ここには置けません：離着陸エリア上、ネットに近すぎる、または天井までの高さが足りません。",

    secPhase: "ミッション段階", phTakeoff: "離陸", phTransit: "移動", phLand: "着陸", phDone: "完了",
    secLive: "リアルタイム計測", tileLand: "的の前に着陸", tileCrash: "衝突", tileSep: "最小機体間距離", tileObs: "障害物",
    secDrones: "各機", stFly: "飛行中", stArr: "到着", stLanded: "着陸済", stDead: "墜落", stPad: "待機", battery: "電池",
    chartSep: "2機間の最小距離", chartSepTouch: "プロペラ接触 12 cm", chartSepTarget: "基準 50 cm",
    chartAlt: "各機の高度", secLog: "イベントログ",

    evTakeoff: "入口マット上の3つのパッドから離陸",
    evArrive: (t, i) => `<b>${t}秒</b> CF${i} 的に到着`,
    evLand: (t, i) => `<b>${t}秒</b> CF${i} 着陸`,
    evDone: t => `<b>${t}秒</b> 完了：3機とも着陸`,
    evCollide: (t, i, j) => `<b>${t}秒</b> CF${i} と CF${j} が衝突`,
    evObstacle: (t, i) => `<b>${t}秒</b> CF${i} が障害物に衝突`,
    evNet: (t, i) => `<b>${t}秒</b> CF${i} がネットに接触`,
    evFloor: (t, i) => `<b>${t}秒</b> CF${i} が床に接触`,
    evEdit: t => `<b>${t}秒</b> 障害物を変更 — 流れ場を再計算`,
    evAir: (t, name, on) => `<b>${t}秒</b> ${name}を${on ? "オン" : "オフ"}`,
    evAirChange: (t, name) => `<b>${t}秒</b> ${name}：風を変更`,
    evLayout: s => `配置：${s}`, custom: "カスタム",
    evTrim: (k, n) => `ケージに合わせて配置を調整：${n}個のうち${k}個を配置（残りは置く場所がありません）`,
    recalc: "流れ場を再計算中…",
    loading: n => `3D圧力場を計算中（${n.toLocaleString("ja-JP")}セル）…`,

    cmpTitle: "比較実験", cmpRun: "比較を実行", cmpRunning: "実行中…", on: "あり", off: "なし",
    cmpDesc: (n, k, w, z, x, y, h, c) => `現在のケージ（${x} × ${y} × ${h} m、障害物${n}個、運転中の扇風機・エアコン${k}台、ネット外の扇風機${w}、雑音${z}、風の補正${c}）で4つの構成を各10回飛行させます（離陸位置を数cmずらす）。成功＝3機とも衝突なしで着陸。`,
    cmpFoot: "緑＝各列の最良、赤＝最悪。最小距離・時間・電力量は成功率80%以上の構成のみで比較。行をクリックするとその構成を3Dで飛行します。",
    setupA: "流れ場 + 強化学習", setupAs: "2つの特許",
    setupB: "流れ場 + 仮想ばね", setupBs: "2019年の特許",
    setupC: "流れ場、相互作用なし", setupCs: "粒子法なし",
    setupD: "直進 + 強化学習", setupDs: "格子法なし",
    colSetup: "構成", colSuccess: "成功", colCrash: "衝突", colSep: "最小距離", colTime: "所要時間", colEnergy: "電力量",
    unitSuccess: "% (回)", unitCrash: "機/回", unitSep: "cm", unitTime: "秒", unitEnergy: "mWh/機",
  },
};

/** Current language: Japanese when the browser is set to Japanese, otherwise English (remembered per browser). */
let language = (navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "en";
try {
  const saved = localStorage.getItem("cage-lang2");
  if (saved && TEXTS[saved]) language = saved;
} catch (e) { /* storage blocked: keep the browser language */ }

/** The text for a key in the current language (falls back to English). */
function text(key) {
  return TEXTS[language][key] !== undefined ? TEXTS[language][key] : TEXTS.en[key];
}

/** Display name of an obstacle; fans and air conditioners get their number, e.g. "Fan 2". */
function obstacleName(o) {
  const name = text("names")[o.type];
  return o.number ? `${name} ${o.number}` : name;
}

/** Display name of a layout. */
function layoutName(name) {
  return name === "custom" ? text("custom") : text("layout" + name[0].toUpperCase() + name.slice(1));
}
