// R-001 Spike: .vil → 内部モデル → .vil の round-trip 検証（使い捨てコード）
//
// 実行: node spikes/r-001-vil-roundtrip/roundtrip.mjs [*.vil ...]
// 引数を省略すると fixtures/cornix-lp/baseline.vil と edge-cases.vil を検証する。
//
// 検証するのは次の2点。
//   意味一致: import した内部モデルを export し、再度 import して構造が一致するか
//   byte一致: Vial（python json.dumps）が書いた元のバイト列を復元できるか

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");

// Vial の save_layout が書き出す key 順（vial-gui: src/main/python/protocol/keyboard_comm.py）
const VIL_KEYS = [
  "version",
  "uid",
  "layout",
  "encoder_layout",
  "layout_options",
  "macro",
  "vial_protocol",
  "via_protocol",
  "tap_dance",
  "combo",
  "key_override",
  "alt_repeat_key",
  "settings",
];

/**
 * uid は 64bit 整数で JSON.parse では桁落ちするため、parse 前に文字列へ置き換える。
 * 未知の top-level field は raw のまま保持する。
 */
function importVil(text) {
  const patched = text.replace(/("uid"\s*:\s*)(\d+)/, '$1"$2"');
  const raw = JSON.parse(patched);
  const known = new Set(VIL_KEYS);
  const unknownKeys = Object.keys(raw).filter((k) => !known.has(k));
  return {
    schema: {
      version: raw.version,
      vialProtocol: raw.vial_protocol,
      viaProtocol: raw.via_protocol,
    },
    keyboardUid: raw.uid, // 文字列として保持する
    layoutOptions: raw.layout_options,
    layers: raw.layout,
    encoders: raw.encoder_layout,
    macros: raw.macro,
    tapDance: raw.tap_dance,
    combos: raw.combo,
    keyOverrides: raw.key_override,
    altRepeatKeys: raw.alt_repeat_key,
    settings: raw.settings,
    raw: {
      keyOrder: Object.keys(raw),
      unknown: Object.fromEntries(unknownKeys.map((k) => [k, raw[k]])),
    },
  };
}

/** 内部モデル → .vil の dict。元ファイルの key 順を再現する。 */
function exportVil(model) {
  const out = {
    version: model.schema.version,
    uid: model.keyboardUid,
    layout: model.layers,
    encoder_layout: model.encoders,
    layout_options: model.layoutOptions,
    macro: model.macros,
    vial_protocol: model.schema.vialProtocol,
    via_protocol: model.schema.viaProtocol,
    tap_dance: model.tapDance,
    combo: model.combos,
    key_override: model.keyOverrides,
    alt_repeat_key: model.altRepeatKeys,
    settings: model.settings,
    ...model.raw.unknown,
  };
  const ordered = {};
  for (const key of model.raw.keyOrder) if (key in out) ordered[key] = out[key];
  for (const key of Object.keys(out)) if (!(key in ordered)) ordered[key] = out[key];
  return ordered;
}

/** python の json.dumps(ensure_ascii=True) 相当の文字列化。uid だけ数値として出す。 */
function dumpVil(dict) {
  return pyDump(dict).replace(/"uid": "(\d+)"/, '"uid": $1');
}

function pyDump(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(pyDump).join(", ")}]`;
  if (typeof value === "object") {
    const body = Object.entries(value)
      .map(([key, val]) => `${escapeAscii(JSON.stringify(key))}: ${pyDump(val)}`)
      .join(", ");
    return `{${body}}`;
  }
  return escapeAscii(JSON.stringify(value));
}

/** python の json.dumps は既定で非 ASCII を \uXXXX へエスケープする。 */
function escapeAscii(text) {
  return text.replace(
    /[\u0080-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function firstDiff(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      return {
        offset: i,
        original: a.slice(Math.max(0, i - 40), i + 40),
        exported: b.slice(Math.max(0, i - 40), i + 40),
      };
    }
  }
  return null;
}

function check(path) {
  const original = readFileSync(path, "utf8").trimEnd();
  const model = importVil(original);
  const exported = dumpVil(exportVil(model));

  // 意味一致: export したものを import し直してモデルが一致するか
  const reimported = importVil(exported);
  const semanticEqual = JSON.stringify(reimported) === JSON.stringify(model);
  const byteEqual = exported === original;

  console.log(`\n=== ${path.replace(`${REPO}/`, "")}`);
  console.log(`未知の top-level field : ${Object.keys(model.raw.unknown).join(", ") || "なし"}`);
  console.log(`uid（文字列で保持）    : ${model.keyboardUid}`);
  console.log(`uid（素の JSON.parse） : ${String(JSON.parse(original).uid)}`);
  console.log(`意味一致               : ${semanticEqual}`);
  console.log(`byte 一致              : ${byteEqual}`);
  if (!byteEqual) {
    const diff = firstDiff(original, exported);
    console.log(`  最初の差分 offset=${diff.offset}`);
    console.log(`  original: ${JSON.stringify(diff.original)}`);
    console.log(`  exported: ${JSON.stringify(diff.exported)}`);
  }
  return semanticEqual;
}

const targets = process.argv.slice(2);
const files =
  targets.length > 0
    ? targets
    : [resolve(REPO, "fixtures/cornix-lp/baseline.vil"), resolve(HERE, "edge-cases.vil")];

let ok = true;
for (const file of files) ok = check(file) && ok;
console.log(`\n結果: 意味 round-trip ${ok ? "成功" : "失敗"}`);
process.exit(ok ? 0 : 1);
