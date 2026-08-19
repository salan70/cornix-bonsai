/**
 * 組み合わせ検証。keymap が「どの definition で解釈されるか」「どの実機へ書かれるか」と
 * 食い違っていないかを見る。
 *
 * severity の分かれ目はここが一番はっきりしている（ADR 0010）。
 *   - **座標の意味が変わる**もの（matrix の形、実機 uid、容量不足）は error。
 *     1 件の欠落ではなく、全キーが誤った位置へ行く
 *   - **1 件単位で欠ける**もの（definition に無い位置、encoder 数、未対応 qsid）は warning
 */

import { toPhysicalLayout } from "../definition/parse.ts";
import type { KeyboardDefinition } from "../definition/types.ts";
import type { Capacities } from "../keycode/table.ts";
import { observeCapacities } from "../model/keymap-view.ts";
import { isAbsent, type VilDocument } from "../vil/types.ts";
import { createDiagnostic, type Diagnostic } from "./types.ts";

/**
 * 実機が申告した事実。`apply/plan.ts` の `DeviceSnapshot`（wire 値）とは別物で、
 * こちらは検証に必要な申告値だけを持つ。
 */
export interface DeviceProfile {
  readonly keyboardUid: string;
  /** 実機が申告した容量。`.vil` から観測した値で代用してはいけない（ADR 0003）。 */
  readonly capacities: Capacities;
  /** 実機が対応する qsid。settings の write 可否はこれで決まる。 */
  readonly supportedQsids: readonly number[];
}

/**
 * keymap と keyboard definition の組み合わせを検証する。
 *
 * @doc docs/specs/validation.md#validatecompatibility
 */
export function validateCompatibility(
  document: VilDocument,
  definition: KeyboardDefinition,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const physical = toPhysicalLayout(definition);

  const rows = document.layout[0]?.length ?? 0;
  const cols = document.layout[0]?.[0]?.length ?? 0;
  if (rows !== definition.matrix.rows || cols !== definition.matrix.cols) {
    diagnostics.push(
      createDiagnostic(
        "compatibility/matrix-shape-mismatch",
        "error",
        { kind: "document" },
        `matrix の形が definition と違う（keymap ${rows}x${cols} / definition ${definition.matrix.rows}x${definition.matrix.cols}）`,
        {
          keymapRows: rows,
          keymapCols: cols,
          definitionRows: definition.matrix.rows,
          definitionCols: definition.matrix.cols,
        },
      ),
    );
    // 形が違う時点で以降の位置比較は意味を持たない。座標の対応そのものが未定義になる。
    return diagnostics;
  }

  const defined = new Set(physical.keys.map((key) => `${key.row},${key.col}`));
  const orphans = new Set<string>();
  const absent = new Set<string>();
  document.layout.forEach((layer) => {
    layer.forEach((row, rowIndex) => {
      row.forEach((entry, colIndex) => {
        const key = `${rowIndex},${colIndex}`;
        if (isAbsent(entry)) {
          if (defined.has(key)) absent.add(key);
          return;
        }
        if (!defined.has(key)) orphans.add(key);
      });
    });
  });

  // layer ごとに出すと同じ事実が layer 数だけ並ぶ。位置単位で 1 件にまとめる。
  for (const key of [...orphans].sort()) {
    diagnostics.push(
      createDiagnostic(
        "compatibility/orphan-position",
        "warning",
        positionSubject(key),
        `keymap に割り当てがあるが、definition の物理配列に (${key}) が無い`,
        { position: key },
      ),
    );
  }
  for (const key of [...absent].sort()) {
    diagnostics.push(
      createDiagnostic(
        "compatibility/unassignable-key",
        "warning",
        positionSubject(key),
        `definition には物理キー (${key}) があるが、keymap では -1（キー無し）になっている`,
        { position: key },
      ),
    );
  }

  const definedEncoders = new Set(physical.encoders.map((encoder) => encoder.index)).size;
  const keymapEncoders = document.encoderLayout[0]?.length ?? 0;
  if (definedEncoders !== keymapEncoders) {
    diagnostics.push(
      createDiagnostic(
        "compatibility/encoder-count-mismatch",
        "warning",
        { kind: "document" },
        `encoder の数が definition と違う（keymap ${keymapEncoders} / definition ${definedEncoders}）`,
        { keymap: keymapEncoders, definition: definedEncoders },
      ),
    );
  }

  return diagnostics;
}

/**
 * keymap を実機へ書ける状態かを検証する。実機 read を終えてからでないと呼べない。
 *
 * uid 不一致を error にするのは、別のキーボードの keymap を書くと座標の意味ごと違うため。
 * `assertSameDevice`（ADR 0008）が Apply 直前に投げるのと同じ事実を、
 * **人間確認の前に diff と並べて見せる**ためにここでも診断として出す。
 *
 * @doc docs/specs/validation.md#validatedevicematch
 */
export function validateDeviceMatch(
  document: VilDocument,
  device: DeviceProfile,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (document.uid !== device.keyboardUid) {
    diagnostics.push(
      createDiagnostic(
        "compatibility/uid-mismatch",
        "error",
        { kind: "document" },
        `keymap は別のキーボードのもの（keymap=${document.uid} device=${device.keyboardUid}）`,
        { keymap: document.uid, device: device.keyboardUid },
      ),
    );
  }

  const observed = observeCapacities(document);
  for (const [name, keymapValue, deviceValue] of [
    ["layer", observed.layerCount, device.capacities.layerCount],
    ["tapDance", observed.tapDanceCount, device.capacities.tapDanceCount],
    ["combo", observed.comboCount, device.capacities.comboCount],
    ["macro", observed.macroCount, device.capacities.macroCount],
  ] as const) {
    if (keymapValue <= deviceValue) continue;
    diagnostics.push(
      createDiagnostic(
        "compatibility/capacity-overflow",
        "error",
        { kind: "document" },
        `keymap の ${name} が実機の容量を超えている（keymap ${keymapValue} / 実機 ${deviceValue}）`,
        { target: name, keymap: keymapValue, device: deviceValue },
      ),
    );
  }

  const supported = new Set(device.supportedQsids);
  for (const qsid of Object.keys(document.settings)) {
    if (supported.has(Number(qsid))) continue;
    diagnostics.push(
      createDiagnostic(
        "compatibility/unsupported-setting",
        "warning",
        { kind: "setting", qsid: Number(qsid) },
        `実機が qsid ${qsid} を申告していない。この設定は書き込めない`,
        { qsid },
      ),
    );
  }

  return diagnostics;
}

/** layer 横断の位置を指す subject。layer に依存しない事実なので `layer: -1` で表す。 */
function positionSubject(key: string): { kind: "key"; layer: number; row: number; col: number } {
  const [row, col] = key.split(",");
  return { kind: "key", layer: -1, row: Number(row), col: Number(col) };
}
