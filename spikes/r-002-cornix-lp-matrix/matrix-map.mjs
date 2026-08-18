// R-002 Spike: Cornix LP の物理配列と Vial matrix 座標の対応を出す使い捨てコード。
// 本実装ではない。判断の結果は docs/decisions/0002-keyboard-definition-source.md にある。
//
// keyboard definition (vial.json) の KLE を vial-gui の kle_serial.py と同じ手順で
// 展開し、(row, col) → 物理座標の対応表を作る。実 export と突き合わせて矛盾がないか見る。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

// vial-gui: src/main/python/kle_serial.py の labelMap
const LABEL_MAP = [
  [0, 6, 2, 8, 9, 11, 3, 5, 1, 4, 7, 10],
  [1, 7, -1, -1, 9, 11, 4, -1, -1, -1, -1, 10],
  [3, -1, 5, -1, 9, 11, -1, -1, 4, -1, -1, 10],
  [4, -1, -1, -1, 9, 11, -1, -1, -1, -1, -1, 10],
  [0, 6, 2, 8, 10, -1, 3, 5, 1, 4, 7, -1],
  [1, 7, -1, -1, 10, -1, 4, -1, -1, -1, -1, -1],
  [3, -1, 5, -1, 10, -1, -1, -1, 4, -1, -1, -1],
  [4, -1, -1, -1, 10, -1, -1, -1, -1, -1, -1, -1],
];

function reorderLabels(labels, align) {
  const ret = Array.from({ length: 12 }, () => null);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i]) ret[LABEL_MAP[align][i]] = labels[i];
  }
  return ret;
}

// kle_serial.py の deserialize から、幾何とlabelに効く部分だけを移した実装。
function deserializeKle(rows) {
  let cur = {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotation_angle: 0,
    rotation_x: 0,
    rotation_y: 0,
    decal: false,
  };
  const cluster = { x: 0, y: 0 };
  let align = 4;
  const keys = [];

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const item of row) {
      if (typeof item === "string") {
        keys.push({ ...cur, labels: reorderLabels(item.split("\n"), align) });
        cur.x += cur.width;
        cur.width = cur.height = 1;
        cur.decal = false;
      } else {
        if ("r" in item) cur.rotation_angle = item.r;
        if ("rx" in item) {
          cur.rotation_x = cluster.x = item.rx;
          cur.x = cluster.x;
          cur.y = cluster.y;
        }
        if ("ry" in item) {
          cur.rotation_y = cluster.y = item.ry;
          cur.x = cluster.x;
          cur.y = cluster.y;
        }
        if ("a" in item) align = item.a;
        if ("x" in item) cur.x += item.x;
        if ("y" in item) cur.y += item.y;
        if ("w" in item) cur.width = item.w;
        if ("h" in item) cur.height = item.h;
        if ("d" in item) cur.decal = item.d;
      }
    }
    cur.y += 1;
    cur.x = cur.rotation_x;
  }
  return keys;
}

// vial-gui: keyboard_comm.py reload_layout 相当の分類。
function classify(definition) {
  const keys = [];
  const encoders = [];
  for (const k of deserializeKle(definition.layouts.keymap)) {
    const layoutOption = k.labels[8] ? k.labels[8].split(",").map(Number) : [-1, -1];
    if (k.labels[4] === "e") {
      const [idx, dir] = k.labels[0].split(",").map(Number);
      encoders.push({ idx, dir, x: k.x, y: k.y, layoutOption });
    } else if (k.decal || (k.labels[0] && k.labels[0].includes(","))) {
      const [row, col] = k.labels[0].split(",").map(Number);
      keys.push({
        row,
        col,
        x: k.x,
        y: k.y,
        w: k.width,
        h: k.height,
        r: k.rotation_angle,
        rx: k.rotation_x,
        ry: k.rotation_y,
        labels: k.labels,
        layoutOption,
      });
    }
  }
  return { keys, encoders };
}

const definition = JSON.parse(
  readFileSync(resolve(repoRoot, "fixtures/cornix-lp/vial-definition-v1.12.json"), "utf8"),
);
const vil = JSON.parse(readFileSync(resolve(repoRoot, "fixtures/cornix-lp/baseline.vil"), "utf8"));
const { keys, encoders } = classify(definition);

const problems = [];
const check = (ok, msg) => {
  console.log(`${ok ? "OK  " : "NG  "} ${msg}`);
  if (!ok) problems.push(msg);
};

console.log("== definition ==");
console.log(`name=${definition.name} vid=${definition.vendorId} pid=${definition.productId}`);
console.log(`matrix rows=${definition.matrix.rows} cols=${definition.matrix.cols}`);
console.log(`layouts.labels=${JSON.stringify(definition.layouts.labels)}`);
console.log(
  `customKeycodes: ${definition.customKeycodes.map((k, i) => `USER${String(i).padStart(2, "0")}=${k.name}`).join(" ")}`,
);

// KLE の x/y は回転前の値。回転キーの実際の位置は (rx,ry) を中心に r 度回した後の中心。
function center(k) {
  const cx = k.x + k.w / 2;
  const cy = k.y + k.h / 2;
  if (!k.r) return [cx, cy];
  const rad = (k.r * Math.PI) / 180;
  const dx = cx - k.rx;
  const dy = cy - k.ry;
  return [
    k.rx + dx * Math.cos(rad) - dy * Math.sin(rad),
    k.ry + dx * Math.sin(rad) + dy * Math.cos(rad),
  ];
}

console.log("\n== 物理キー ↔ matrix ==");
// 左右は回転適用後の中心 x で切る。左半分の最も内側が x=6.5、右半分の最も内側が x=8.0。
for (const k of [...keys].sort((a, b) => a.row - b.row || a.col - b.col)) {
  const [cx, cy] = center(k);
  const side = cx < 7.25 ? "L" : "R";
  const rot = k.r ? ` r=${k.r} rx=${k.rx} ry=${k.ry}` : "";
  const extra = k.labels.filter((l, i) => l && i !== 0).map((l) => JSON.stringify(l));
  console.log(
    `(${k.row},${k.col}) ${side} center=(${cx.toFixed(2)}, ${cy.toFixed(2)}) kle=(${k.x.toFixed(2)}, ${k.y.toFixed(2)})${rot}` +
      (extra.length ? ` extraLabels=${extra.join(",")}` : ""),
  );
}

console.log("\n== encoder ==");
// dir の意味は firmware 側で決まる。RMK の GetEncoder は input_data[0..2] に
// counter_clockwise、[2..4] に clockwise を書く（vial-qmk も同順）。
// vial-gui は [0..2] を direction 0 として読むので、dir 0 = CCW。
for (const e of encoders.sort((a, b) => a.idx - b.idx || a.dir - b.dir)) {
  console.log(
    `encoder ${e.idx} dir ${e.dir} (${e.dir === 0 ? "CCW 反時計回り" : "CW 時計回り"}) x=${e.x} y=${e.y}`,
  );
}

console.log("\n== baseline.vil との突き合わせ ==");
const defined = new Set(keys.map((k) => `${k.row},${k.col}`));
check(keys.length === 50, `definition の物理キー数 = ${keys.length}`);
check(
  new Set(encoders.map((e) => e.idx)).size === vil.encoder_layout[0].length,
  `encoder 数 definition=${new Set(encoders.map((e) => e.idx)).size} .vil=${vil.encoder_layout[0].length}`,
);

let mismatched = 0;
for (let l = 0; l < vil.layout.length; l++) {
  for (let r = 0; r < vil.layout[l].length; r++) {
    for (let c = 0; c < vil.layout[l][r].length; c++) {
      const isKey = vil.layout[l][r][c] !== -1;
      if (isKey !== defined.has(`${r},${c}`)) mismatched++;
    }
  }
}
check(mismatched === 0, `.vil の非 -1 位置と definition の (row,col) 集合の不一致 = ${mismatched}`);
check(
  vil.layout.every(
    (layer) =>
      layer.length === definition.matrix.rows &&
      layer.every((row) => row.length === definition.matrix.cols),
  ),
  `.vil の layout 形状が matrix 宣言 (${definition.matrix.rows}x${definition.matrix.cols}) と一致`,
);

const hasLayoutOption =
  keys.some((k) => k.layoutOption[0] !== -1) || encoders.some((e) => e.layoutOption[0] !== -1);
check(!hasLayoutOption, `layout option を持つキー: ${hasLayoutOption ? "あり" : "なし"}`);
check(
  vil.layout_options === 0,
  `.vil の layout_options = ${vil.layout_options}（labels があるので vial-gui は実機値を読む。無ければ -1 が出る）`,
);

console.log(problems.length === 0 ? "\n全チェック通過" : `\n未解決 ${problems.length} 件`);
process.exit(problems.length === 0 ? 0 : 1);
