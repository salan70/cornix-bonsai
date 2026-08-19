/**
 * 構造検証。**入力は `VilDocument` ただ 1 つ**で、definition も容量も実機も参照しない。
 *
 * `parseVil` は top-level の型しか見ておらず、`layout` / `tap_dance` / `combo` の
 * 中身は cast で通している（ADR 0001 の「raw を逐語で保持する」を優先したため）。
 * その cast が嘘になっていないかを確かめるのがこの層の責務。
 *
 * **`keymap.yaml` の schema 検証はここではない**（D-002 の責務）。ここが見るのは
 * `.vil` raw の構造だけで、入力の出どころに依存しない。
 */

import { isAbsent, type VilDocument } from "../vil/types.ts";
import { createDiagnostic, type Diagnostic } from "./types.ts";

/** Vial が現在書き出す `.vil` の version。 */
const KNOWN_VIL_VERSION = 1;

/**
 * `.vil` raw の構造を検証する。
 *
 * 形が壊れているものは**すべて error** にする。この層の異常は「座標の意味が変わる」か
 * 「値を読めない」のどちらかで、1 件単位の欠落として扱えるものが無いため（ADR 0010）。
 * 例外は raw 保持の escape hatch を踏んだことの通知で、これは information になる。
 *
 * @doc docs/specs/validation.md#validatestructure
 */
export function validateStructure(document: VilDocument): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (document.layout.length === 0) {
    diagnostics.push(
      createDiagnostic("structure/empty-layout", "error", { kind: "document" }, "layout が空"),
    );
  }

  const reference = document.layout[0];
  document.layout.forEach((layer, layerIndex) => {
    if (reference !== undefined && layer.length !== reference.length) {
      diagnostics.push(
        createDiagnostic(
          "structure/layer-shape-mismatch",
          "error",
          { kind: "layer", layer: layerIndex },
          `layer ${layerIndex} の row 数が layer 0 と違う`,
          { expected: reference.length, actual: layer.length },
        ),
      );
    }
    layer.forEach((row, rowIndex) => {
      const referenceRow = reference?.[rowIndex];
      if (referenceRow !== undefined && row.length !== referenceRow.length) {
        diagnostics.push(
          createDiagnostic(
            "structure/layer-shape-mismatch",
            "error",
            { kind: "layer", layer: layerIndex },
            `layer ${layerIndex} row ${rowIndex} の col 数が layer 0 と違う`,
            { row: rowIndex, expected: referenceRow.length, actual: row.length },
          ),
        );
      }
      row.forEach((entry, colIndex) => {
        if (typeof entry === "string" || isAbsent(entry)) return;
        diagnostics.push(
          createDiagnostic(
            "structure/invalid-key-entry",
            "error",
            { kind: "key", layer: layerIndex, row: rowIndex, col: colIndex },
            "layout の要素は keycode 文字列か -1 でなければならない",
            { actual: describeType(entry) },
          ),
        );
      });
    });
  });

  const encoderCount = document.encoderLayout[0]?.length;
  document.encoderLayout.forEach((layer, layerIndex) => {
    if (encoderCount !== undefined && layer.length !== encoderCount) {
      diagnostics.push(
        createDiagnostic(
          "structure/encoder-count-mismatch",
          "error",
          { kind: "layer", layer: layerIndex },
          `layer ${layerIndex} の encoder 数が layer 0 と違う`,
          { expected: encoderCount, actual: layer.length },
        ),
      );
    }
    layer.forEach((encoder, index) => {
      if (encoder.length === 2 && encoder.every((value) => typeof value === "string")) return;
      diagnostics.push(
        createDiagnostic(
          "structure/invalid-encoder-entry",
          "error",
          { kind: "encoder", layer: layerIndex, index, direction: "ccw" },
          "encoder は [反時計回り, 時計回り] の 2 要素でなければならない",
          { length: encoder.length },
        ),
      );
    });
  });

  document.tapDance.forEach((entry, index) => {
    const shaped =
      Array.isArray(entry) &&
      entry.length === 5 &&
      entry.slice(0, 4).every((value) => typeof value === "string") &&
      Number.isInteger(entry[4]) &&
      entry[4] >= 0;
    if (shaped) return;
    diagnostics.push(
      createDiagnostic(
        "structure/invalid-tap-dance-entry",
        "error",
        { kind: "tapDance", index },
        "tap dance は [tap, hold, double tap, hold after tap, timeout] でなければならない",
      ),
    );
  });

  document.combo.forEach((entry, index) => {
    const shaped =
      Array.isArray(entry) && entry.length === 5 && entry.every((v) => typeof v === "string");
    if (shaped) return;
    diagnostics.push(
      createDiagnostic(
        "structure/invalid-combo-entry",
        "error",
        { kind: "combo", index },
        "combo は [入力 4, 出力 1] の 5 要素でなければならない",
      ),
    );
  });

  for (const [qsid, value] of Object.entries(document.settings)) {
    if (Number.isInteger(value) && value >= 0 && /^\d+$/.test(qsid)) continue;
    diagnostics.push(
      createDiagnostic(
        "structure/invalid-setting",
        "error",
        { kind: "setting", qsid: Number(qsid) },
        "settings の key は qsid の 10 進表記、値は非負整数でなければならない",
        { qsid, value },
      ),
    );
  }

  // ここから下は escape hatch を踏んだことの通知。値は保持されているので information。
  if (document.layoutOptions < 0) {
    diagnostics.push(
      createDiagnostic(
        "structure/layout-options-unread",
        "information",
        { kind: "field", name: "layout_options" },
        "layout_options が負。Vial が実機から読まなかった状態で、0 とは区別する",
        { raw: document.layoutOptions },
      ),
    );
  }

  for (const name of Object.keys(document.raw.unknown)) {
    diagnostics.push(
      createDiagnostic(
        "structure/unknown-field-preserved",
        "information",
        { kind: "field", name },
        `未知の top-level field "${name}" をそのまま保持した`,
      ),
    );
  }

  if (document.version !== KNOWN_VIL_VERSION) {
    diagnostics.push(
      createDiagnostic(
        "structure/unknown-vil-version",
        "information",
        { kind: "field", name: "version" },
        `.vil の version が想定外。raw のまま扱う`,
        { version: document.version, known: KNOWN_VIL_VERSION },
      ),
    );
  }

  return diagnostics;
}

function describeType(value: unknown): string {
  return value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
}
