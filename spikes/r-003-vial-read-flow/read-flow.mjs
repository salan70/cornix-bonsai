// R-003 Spike: vial-gui の read フロー（Keyboard.reload 相当）を mock device に対して実行し、
// 完全な deviceState を再構築できるかを確かめる使い捨てコード。本実装ではない。
//
// 参照した実装（vial-gui v0.7.1 / main）:
//   src/main/python/protocol/keyboard_comm.py ... reload / reload_layout / reload_keymap / save_layout
//   src/main/python/protocol/dynamic.py, tap_dance.py, combo.py, macro.py
//   src/main/python/editor/qmk_settings.py    ... qsid の幅と LE 解釈
//   src/main/python/kle_serial.py             ... definition の KLE 展開（R-002 と同じ）
//
// mock 側 (mock-device.mjs) は RMK の実装から、こちらは vial-gui の実装から独立に写している。
// 値が一致すれば、両者の byte 並べ方の理解が食い違っていないことになる。

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createMockDevice, KEYBOARD_ID, RMK_SETTING_KEYS } from "./mock-device.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const MSG_LEN = 32;
const BUFFER_FETCH_CHUNK = 28;

// vial-gui: kle_serial.py の labelMap（R-002 spike からの写し）
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

function deserializeKle(rows) {
  let cur = { x: 0, y: 0, width: 1, height: 1, rotation_x: 0, decal: false };
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
        if ("rx" in item) {
          cur.rotation_x = cluster.x = item.rx;
          cur.x = cluster.x;
          cur.y = cluster.y;
        }
        if ("ry" in item) {
          cluster.y = item.ry;
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

function unxz(buf) {
  const r = spawnSync("xz", ["-d", "-c"], { input: buf, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`xz -d failed: ${r.stderr}`);
  return r.stdout;
}

// ---------------------------------------------------------------- read flow

function readDeviceState(dev) {
  const send = (bytes) => dev.send(Uint8Array.from(bytes));
  const dvOf = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u32le = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  const u16le = (n) => [n & 0xff, (n >> 8) & 0xff];
  const u16be = (n) => [(n >> 8) & 0xff, n & 0xff];

  const st = {};

  // --- 1. reload_layout
  st.viaProtocol = dvOf(send([0x01])).getUint16(1, false);

  let d = send([0xfe, 0x00]);
  st.vialProtocol = dvOf(d).getUint32(0, true);
  st.keyboardId = dvOf(d).getBigUint64(4, true);

  d = send([0xfe, 0x01]);
  let sz = dvOf(d).getUint32(0, true);
  st.definitionSize = sz;

  const chunks = [];
  for (let block = 0; sz > 0; block++, sz -= MSG_LEN) {
    const page = send([0xfe, 0x02, ...u32le(block)]);
    chunks.push(sz < MSG_LEN ? page.subarray(0, sz) : page);
  }
  const definition = JSON.parse(unxz(Buffer.concat(chunks.map(Buffer.from))).toString("utf8"));
  st.definition = definition;

  st.rows = definition.matrix.rows;
  st.cols = definition.matrix.cols;
  st.layoutLabels = definition.layouts.labels ?? null;
  st.customKeycodes = definition.customKeycodes ?? null;

  const rowcol = [];
  const encoderpos = new Set();
  for (const k of deserializeKle(definition.layouts.keymap)) {
    if (k.labels[4] === "e") {
      encoderpos.add(Number(k.labels[0].split(",")[0]));
    } else if (k.decal || (k.labels[0] && k.labels[0].includes(","))) {
      const [row, col] = k.labels[0].split(",").map(Number);
      rowcol.push([row, col]);
    }
  }
  st.rowcol = rowcol;
  st.encoderIndices = [...encoderpos].sort((a, b) => a - b);
  st.encoderCount = st.encoderIndices.length === 0 ? 0 : Math.max(...st.encoderIndices) + 1;

  // --- 2. reload_layers
  st.layers = send([0x11])[1];

  // --- 3. reload_macros_early
  st.macroCount = send([0x0c])[1];
  st.macroMemory = dvOf(send([0x0d])).getUint16(1, false);

  // --- 4. reload_persistent_rgb / reload_rgb
  // definition.lighting === "none" のため lighting 系の read は 1 回も走らない。
  st.lighting = definition.lighting;

  // --- 5. reload_settings
  st.settings = {};
  st.supportedSettings = [];
  st.settingsQueryCount = 0;
  if (st.vialProtocol >= 4) {
    let cur = 0;
    while (cur !== 0xffff) {
      d = send([0xfe, 0x09, ...u16le(cur)]);
      st.settingsQueryCount++;
      for (let x = 0; x < d.length; x += 2) {
        const qsid = dvOf(d).getUint16(x, true);
        cur = Math.max(cur, qsid);
        if (qsid !== 0xffff) st.supportedSettings.push(qsid);
      }
    }
    for (const qsid of st.supportedSettings) {
      const def = QSID_FIELDS[qsid];
      if (!def) continue; // vial-gui: is_qsid_supported が false なら read しない
      d = send([0xfe, 0x0a, ...u16le(qsid)]);
      if (d[0] !== 0) continue;
      let v = 0;
      for (let i = def.width - 1; i >= 0; i--) v = (v << 8) | d[1 + i]; // little endian
      st.settings[qsid] = v;
    }
  }

  // --- 6. reload_dynamic
  d = send([0xfe, 0x0d, 0x00]);
  st.tapDanceCount = d[0];
  st.comboCount = d[1];
  st.keyOverrideCount = d[2];
  st.altRepeatKeyCount = d[3];
  st.capsWord = (d[31] & 1) === 1;

  // --- 8. reload_keymap
  const size = st.layers * st.rows * st.cols * 2;
  const keymap = new Uint8Array(size);
  for (let off = 0; off < size; off += BUFFER_FETCH_CHUNK) {
    const n = Math.min(size - off, BUFFER_FETCH_CHUNK);
    d = send([0x12, ...u16be(off), n]);
    keymap.set(d.subarray(4, 4 + n), off);
  }
  const kdv = new DataView(keymap.buffer);
  st.layout = new Map();
  for (let layer = 0; layer < st.layers; layer++) {
    for (const [row, col] of rowcol) {
      const off = layer * st.rows * st.cols * 2 + row * st.cols * 2 + col * 2;
      st.layout.set(`${layer},${row},${col}`, kdv.getUint16(off, false));
    }
  }

  st.encoderLayout = new Map();
  for (let layer = 0; layer < st.layers; layer++) {
    for (const idx of st.encoderIndices) {
      d = send([0xfe, 0x03, layer, idx]);
      st.encoderLayout.set(`${layer},${idx},0`, dvOf(d).getUint16(0, false));
      st.encoderLayout.set(`${layer},${idx},1`, dvOf(d).getUint16(2, false));
    }
  }

  st.layoutOptions = -1;
  if (st.layoutLabels) {
    d = send([0x02, 0x02]);
    st.layoutOptions = dvOf(d).getUint32(2, false);
  }

  // --- 9. reload_macros_late
  let macroBuf = new Uint8Array(0);
  if (st.macroMemory) {
    for (let x = 0; x < st.macroMemory; x += BUFFER_FETCH_CHUNK) {
      const n = Math.min(BUFFER_FETCH_CHUNK, st.macroMemory - x);
      d = send([0x0e, ...u16be(x), n]);
      const merged = new Uint8Array(macroBuf.length + n);
      merged.set(macroBuf);
      merged.set(d.subarray(4, 4 + n), macroBuf.length);
      macroBuf = merged;
      if (macroBuf.filter((b) => b === 0).length > st.macroCount) break;
    }
  }
  st.macros = splitMacros(macroBuf, st.macroCount);

  // --- 10..13. dynamic entries
  st.tapDance = [];
  for (let i = 0; i < st.tapDanceCount; i++) {
    d = send([0xfe, 0x0d, 0x01, i]);
    if (d[0] !== 0) throw new Error(`tap dance ${i} failed`);
    const v = dvOf(d);
    st.tapDance.push([
      v.getUint16(1, true),
      v.getUint16(3, true),
      v.getUint16(5, true),
      v.getUint16(7, true),
      v.getUint16(9, true),
    ]);
  }
  st.combo = [];
  for (let i = 0; i < st.comboCount; i++) {
    d = send([0xfe, 0x0d, 0x03, i]);
    if (d[0] !== 0) throw new Error(`combo ${i} failed`);
    const v = dvOf(d);
    st.combo.push([
      v.getUint16(1, true),
      v.getUint16(3, true),
      v.getUint16(5, true),
      v.getUint16(7, true),
      v.getUint16(9, true),
    ]);
  }
  st.keyOverride = []; // count が 0 なので read は発生しない
  st.altRepeatKey = [];

  return st;
}

function splitMacros(buf, count) {
  const out = [];
  let cur = [];
  for (const b of buf) {
    if (b === 0) {
      out.push(Uint8Array.from(cur));
      cur = [];
    } else {
      cur.push(b);
    }
  }
  while (out.length < count) out.push(new Uint8Array(0));
  return out.slice(0, count);
}

// vial-gui: resources/base/qmk_settings.json のうち RMK が返す qsid の幅だけを写したもの。
const QSID_FIELDS = {
  0x02: { width: 2 },
  0x06: { width: 2 },
  0x07: { width: 2 },
  0x12: { width: 2 },
  0x13: { width: 2 },
  0x16: { width: 1 },
  0x17: { width: 1 },
  0x19: { width: 2 },
  0x1a: { width: 1 },
  0x1b: { width: 2 },
};

// save_layout 相当。keycode は u16 のまま置く（名前への変換は D-001 の正規化テーブル待ち）。
function saveLayout(st) {
  const layout = [];
  for (let l = 0; l < st.layers; l++) {
    const layer = [];
    for (let r = 0; r < st.rows; r++) {
      const row = [];
      for (let c = 0; c < st.cols; c++) row.push(st.layout.get(`${l},${r},${c}`) ?? -1);
      layer.push(row);
    }
    layout.push(layer);
  }
  const encoderLayout = [];
  for (let l = 0; l < st.layers; l++) {
    const layer = [];
    for (let e = 0; e < st.encoderCount; e++) {
      layer.push([
        st.encoderLayout.get(`${l},${e},0`) ?? -1,
        st.encoderLayout.get(`${l},${e},1`) ?? -1,
      ]);
    }
    encoderLayout.push(layer);
  }
  return {
    version: 1,
    uid: st.keyboardId,
    layout,
    encoder_layout: encoderLayout,
    layout_options: st.layoutOptions,
    macro: st.macros,
    vial_protocol: st.vialProtocol,
    via_protocol: st.viaProtocol,
    tap_dance: st.tapDance,
    combo: st.combo,
    key_override: st.keyOverride,
    alt_repeat_key: st.altRepeatKey,
    settings: st.settings,
  };
}

// ---------------------------------------------------------------- run

const definitionJson = JSON.parse(
  readFileSync(resolve(repoRoot, "fixtures/cornix-lp/vial-definition-v1.12.json"), "utf8"),
);
const baseline = JSON.parse(
  readFileSync(resolve(repoRoot, "fixtures/cornix-lp/baseline.vil"), "utf8"),
);

const dev = createMockDevice({
  definitionJson,
  layers: baseline.layout.length,
  encoderCount: baseline.encoder_layout[0].length,
  morseCount: baseline.tap_dance.length,
  comboCount: baseline.combo.length,
});

const st = readDeviceState(dev);
const vil = saveLayout(st);

const problems = [];
const check = (ok, msg) => {
  console.log(`${ok ? "OK  " : "NG  "} ${msg}`);
  if (!ok) problems.push(msg);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("== 再構築した deviceState ==");
console.log(`via_protocol=${st.viaProtocol} vial_protocol=${st.vialProtocol} uid=${st.keyboardId}`);
console.log(
  `layers=${st.layers} rows=${st.rows} cols=${st.cols} encoders=${st.encoderCount} lighting=${st.lighting}`,
);
console.log(
  `macro_count=${st.macroCount} macro_memory=${st.macroMemory} tap_dance=${st.tapDanceCount} combo=${st.comboCount} ` +
    `key_override=${st.keyOverrideCount} alt_repeat_key=${st.altRepeatKeyCount} caps_word=${st.capsWord}`,
);
console.log(`layout_options=${st.layoutOptions} settings=${JSON.stringify(st.settings)}`);

console.log("\n== 値の一致（RMK 側の encode と vial-gui 側の decode が独立に書かれている） ==");
{
  let ok = true;
  for (let l = 0; l < st.layers && ok; l++) {
    for (const [r, c] of st.rowcol) {
      const want = dev.state.keymap[l * st.rows * st.cols + r * st.cols + c];
      if (st.layout.get(`${l},${r},${c}`) !== want) {
        ok = false;
        break;
      }
    }
  }
  check(ok, "keymap: 宣言済み (row, col) の keycode が firmware 側の値と全一致する");
}
{
  let ok = true;
  for (let l = 0; l < st.layers; l++) {
    for (let e = 0; e < st.encoderCount; e++) {
      if (st.encoderLayout.get(`${l},${e},0`) !== dev.state.encoders[l][e].ccw) ok = false;
      if (st.encoderLayout.get(`${l},${e},1`) !== dev.state.encoders[l][e].cw) ok = false;
    }
  }
  check(ok, "encoder: direction 0 = counter clockwise, direction 1 = clockwise で一致する");
}
check(
  eq(
    st.tapDance,
    dev.state.morses.map((m) => [m.tap, m.hold, m.doubleTap, m.holdAfterTap, m.timeout]),
  ),
  "tap dance: RMK の morse (tap, hold, double tap, hold after tap, timeout) と一致する",
);
check(
  eq(
    st.combo,
    dev.state.combos.map((c) => [...c.actions, c.output]),
  ),
  "combo: 入力 4 + 出力 1 が一致する",
);
check(
  eq(
    Object.fromEntries(Object.entries(st.settings).map(([k, v]) => [Number(k), v])),
    Object.fromEntries(dev.state.settings),
  ),
  "settings: qsid の値が一致する（integer は LE u16、boolean は 1 byte）",
);
check(
  eq(
    st.macros.map((m) => [...m]),
    dev.state.macroBodies.map((m) => [...m]),
  ),
  "macro: NUL 区切りの分解結果が firmware の buffer と一致する",
);
check(st.keyboardId === KEYBOARD_ID, "uid: LE u64 として読める（JS では BigInt が要る）");

console.log("\n== baseline.vil との構造一致 ==");
const shape = (v) => [v.layout.length, v.layout[0].length, v.layout[0][0].length];
check(
  eq(shape(vil), shape(baseline)),
  `layout の形が baseline.vil と一致する (${shape(baseline).join("x")})`,
);
const minusOne = (v) => {
  const out = [];
  v.layout.forEach((layer, l) =>
    layer.forEach((row, r) => row.forEach((code, c) => code === -1 && out.push(`${l},${r},${c}`))),
  );
  return out;
};
check(
  eq(minusOne(vil), minusOne(baseline)),
  "-1 になる位置の集合が baseline.vil と一致する（definition 由来）",
);
check(
  eq(
    [vil.encoder_layout.length, vil.encoder_layout[0].length, vil.encoder_layout[0][0].length],
    [
      baseline.encoder_layout.length,
      baseline.encoder_layout[0].length,
      baseline.encoder_layout[0][0].length,
    ],
  ),
  "encoder_layout の形が baseline.vil と一致する",
);
check(vil.macro.length === baseline.macro.length, "macro の本数が baseline.vil と一致する");
check(
  vil.tap_dance.length === baseline.tap_dance.length,
  "tap_dance の本数が baseline.vil と一致する",
);
check(vil.combo.length === baseline.combo.length, "combo の本数が baseline.vil と一致する");
check(
  eq(vil.key_override, baseline.key_override) && eq(vil.alt_repeat_key, baseline.alt_repeat_key),
  "key_override / alt_repeat_key がどちらも空（RMK 未実装）",
);
check(
  eq(
    Object.keys(st.settings)
      .map(Number)
      .sort((a, b) => a - b),
    Object.keys(baseline.settings)
      .map(Number)
      .sort((a, b) => a - b),
  ),
  "settings の qsid 集合が baseline.vil と一致する",
);
check(
  !st.supportedSettings.includes(0x19) && !(0x19 in st.settings),
  "QuickTapTerm (0x19) は rmk-v0.8.2 の SettingKey に無く、baseline.vil にも無い",
);
check(vil.layout_options === baseline.layout_options, "layout_options が baseline.vil と一致する");
check(st.settingsQueryCount === 1, "settings の qsid 列挙は 1 往復で終わる（0xFFFF が混ざるため）");

console.log("\n== transaction 数 ==");
const counts = new Map();
for (const c of dev.log) counts.set(c, (counts.get(c) ?? 0) + 1);
for (const [c, n] of counts) console.log(`  ${String(n).padStart(4)}  ${c}`);
console.log(`  ${String(dev.log.length).padStart(4)}  合計`);

console.log(problems.length === 0 ? "\n矛盾なし" : `\n矛盾 ${problems.length} 件`);
process.exit(problems.length === 0 ? 0 : 1);
