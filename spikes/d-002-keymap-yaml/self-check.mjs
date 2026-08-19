// D-002 Spike: 候補 schema を代表 fixture で比較する。実機も browser も要らない。
//
//   nix develop -c node spikes/d-002-keymap-yaml/self-check.mjs

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANDIDATES } from "./candidates.mjs";

const failures = [];
function check(label, ok, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

/** fixture を読む。uid は 64bit なので JSON.parse に通す前にテキストから取る。 */
function loadVil(path) {
  const text = readFileSync(path, "utf8");
  const uid = /"uid":\s*(\d+)/.exec(text)?.[1];
  const json = JSON.parse(text);
  return {
    uid,
    version: json.version,
    vialProtocol: json.vial_protocol,
    viaProtocol: json.via_protocol,
    layoutOptions: json.layout_options,
    layout: json.layout,
  };
}

const baseline = loadVil("fixtures/cornix-lp/baseline.vil");

/** layout の 1 マスだけ差し替えた doc を作る。 */
function withKey(doc, layer, row, col, keycode) {
  const layout = doc.layout.map((l, li) =>
    li !== layer
      ? l
      : l.map((r, ri) => (ri !== row ? r : r.map((e, ci) => (ci !== col ? e : keycode)))),
  );
  return { ...doc, layout };
}

/** layer を 1 枚足した doc を作る。 */
function withExtraLayer(doc) {
  const shape = doc.layout[0].map((row) =>
    row.map((entry) => (typeof entry === "number" ? entry : "KC_TRNS")),
  );
  return { ...doc, layout: [...doc.layout, shape] };
}

const dir = mkdtempSync(join(tmpdir(), "d-002-"));

/** git diff --numstat で変更行数を測る。 */
function diffLines(before, after, name) {
  const a = join(dir, `${name}.a.yaml`);
  const b = join(dir, `${name}.b.yaml`);
  writeFileSync(a, before);
  writeFileSync(b, after);
  try {
    execFileSync("git", ["diff", "--no-index", "--numstat", a, b], { encoding: "utf8" });
    return 0;
  } catch (error) {
    const [added, removed] = error.stdout.trim().split("\t");
    return Number(added) + Number(removed);
  }
}

console.log("# 候補 schema の比較（fixtures/cornix-lp/baseline.vil）\n");
console.log("| 案 | 全体行数 | 1キー変更の diff 行数 | layer 追加の diff 行数 |");
console.log("| -- | -------- | --------------------- | ---------------------- |");

const oneKey = withKey(baseline, 0, 0, 1, "KC_ESC");
const extraLayer = withExtraLayer(baseline);
const measured = {};

for (const [name, emit] of Object.entries(CANDIDATES)) {
  const base = emit(baseline);
  const stats = {
    lines: base.trimEnd().split("\n").length,
    oneKey: diffLines(base, emit(oneKey), `${name}-key`),
    layer: diffLines(base, emit(extraLayer), `${name}-layer`),
  };
  measured[name] = stats;
  console.log(`| ${name} | ${stats.lines} | ${stats.oneKey} | ${stats.layer} |`);
}

console.log("");

// 1 キー変更の diff は、案 B / C が「変更した行だけ」に収まること。
check("案A: 1 キー変更の diff は 2 行", measured.A.oneKey === 2);
check("案B: 1 キー変更の diff は 2 行", measured.B.oneKey === 2);
check("案C: 1 キー変更の diff は 2 行", measured.C.oneKey === 2);

// 全体行数。案 A / C は格子が読めないうえに行数も多い。
check(
  "案B の行数が案A・案C より少ない",
  measured.B.lines < measured.A.lines && measured.B.lines < measured.C.lines,
  `A=${measured.A.lines} B=${measured.B.lines} C=${measured.C.lines}`,
);

// layer 追加は、どの案でも追加行だけで済むこと（既存 layer の行がずれない）。
// 追加される行は row 数 + layer 見出しの comment 1 行。既存の layer の行は 1 行も動かない。
check(
  "案B: layer 追加は追加行だけで済む",
  measured.B.layer === baseline.layout[0].length + 1,
  `${measured.B.layer} 行 = row ${baseline.layout[0].length} + 見出し 1`,
);

// 案 C は位置が key なので順序に依存しない。案 A / B は配列の位置が意味を持つ。
const cText = CANDIDATES.C(baseline);
check("案C: 位置が key として現れる", cText.includes("L0.r0.c0:"));

// keycode は必ず引用する。引用しないと YAML が `KC_NO` 以外の表記を型変換しうる。
const bText = CANDIDATES.B(baseline);
check("案B: keycode が引用されている", bText.includes('"KC_GESC"'));
check("案B: 物理キー無し (-1) は数値のまま", /, -1\]/.test(bText));

// 引用しない場合に何が壊れるかを示す。hex 表記の keycode は edge-cases.vil にある。
const edge = loadVil("fixtures/cornix-lp/edge-cases.vil");
const edgeText = CANDIDATES.B(edge);
check(
  "hex 表記の keycode が引用されている",
  edgeText.includes('"0x1234"'),
  "引用しないと YAML が整数 4660 として読む",
);

console.log("");
if (failures.length > 0) {
  console.error(`失敗 ${failures.length} 件: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("すべて通過");
