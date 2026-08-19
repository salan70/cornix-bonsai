/**
 * 参照解析。keycode 文字列が**その definition とその容量で解決できるか**を判定する。
 *
 * 責務の分け方（ADR 0010）:
 *   - definition に依存する解決（`USERnn`）は `createKeycodeTable` に任せる。
 *     同じ `USER01` が別の keycode を指す definition が実在するため（ADR 0002）
 *   - definition に依存しない語彙の判定は `classifyKeycode` に任せる
 *   - 容量との突き合わせだけがこの module の仕事。容量は実機が申告するもので、
 *     `.vil` から観測した値を実機の容量として使ってはいけない（ADR 0003）
 *
 * 範囲外参照を warning にするのは、Vial 側の `restore_layout` が**無言で `KC_NO` へ落とす**ため。
 * 落ちるのは 1 件単位なので座標の意味は変わらない。error ではなく warning になる。
 */

import type { KeyboardDefinition } from "../definition/types.ts";
import { createKeycodeTable, type Capacities } from "../keycode/table.ts";
import { observeCapacities } from "../model/keymap-view.ts";
import { isAbsent, type VilDocument } from "../vil/types.ts";
import { classifyKeycode } from "./keycode-vocabulary.ts";
import { createDiagnostic, type Diagnostic, type DiagnosticSubject } from "./types.ts";

/**
 * 参照解析を実行する。
 *
 * `capacities` を省略した場合は `.vil` から観測した値を使う。実機 Apply の経路では
 * **必ず実機の申告値を渡す**（ADR 0003）。
 *
 * @doc docs/specs/validation.md#validatereferences
 */
export function validateReferences(
  document: VilDocument,
  definition: KeyboardDefinition,
  capacities: Capacities = observeCapacities(document),
): readonly Diagnostic[] {
  const table = createKeycodeTable(definition, capacities);
  const diagnostics: Diagnostic[] = [];
  const referencedTapDance = new Set<number>();
  const referencedMacro = new Set<number>();

  const check = (subject: DiagnosticSubject, keycode: string): void => {
    const lexeme = classifyKeycode(keycode);

    switch (lexeme.kind) {
      case "unknown":
        diagnostics.push(
          createDiagnostic(
            "reference/unknown-keycode",
            "warning",
            subject,
            `keycode "${keycode}" を語彙表で解釈できない。Vial は解釈できない表記を KC_NO へ落とす`,
            { keycode },
          ),
        );
        return;
      case "numeric":
        diagnostics.push(
          createDiagnostic(
            "reference/numeric-keycode",
            "information",
            subject,
            `keycode "${keycode}" は数値表記。値は保持するが挙動は追えない`,
            { keycode },
          ),
        );
        return;
      case "custom": {
        // custom keycode の実在だけは definition に聞く（ADR 0002）。
        const resolved = table.resolve(keycode);
        if (resolved.kind === "outOfRange") {
          diagnostics.push(
            createDiagnostic(
              "reference/undefined-custom-keycode",
              "warning",
              subject,
              `${keycode} はこの definition に無い（custom keycode は ${table.customKeycodes.length} 個）`,
              { keycode, defined: table.customKeycodes.length },
            ),
          );
        }
        return;
      }
      case "tapDance":
        referencedTapDance.add(lexeme.index);
        pushOutOfRange(
          diagnostics,
          subject,
          keycode,
          lexeme.index,
          capacities.tapDanceCount,
          "tap dance",
        );
        return;
      case "macro":
        referencedMacro.add(lexeme.index);
        pushOutOfRange(diagnostics, subject, keycode, lexeme.index, capacities.macroCount, "macro");
        return;
      case "layerSwitch":
        pushOutOfRange(diagnostics, subject, keycode, lexeme.layer, capacities.layerCount, "layer");
        if (lexeme.inner !== undefined) check(subject, lexeme.inner);
        return;
      case "modified":
      case "modTap":
        check(subject, lexeme.inner);
        return;
      default:
        return;
    }
  };

  document.layout.forEach((layer, layerIndex) => {
    layer.forEach((row, rowIndex) => {
      row.forEach((entry, colIndex) => {
        if (isAbsent(entry)) return;
        check({ kind: "key", layer: layerIndex, row: rowIndex, col: colIndex }, entry);
      });
    });
  });

  document.encoderLayout.forEach((layer, layerIndex) => {
    layer.forEach((encoder, index) => {
      encoder.forEach((keycode, direction) => {
        check(
          { kind: "encoder", layer: layerIndex, index, direction: direction === 0 ? "ccw" : "cw" },
          keycode,
        );
      });
    });
  });

  document.tapDance.forEach((entry, index) => {
    entry.slice(0, 4).forEach((keycode) => {
      if (typeof keycode === "string") check({ kind: "tapDance", index }, keycode);
    });
  });

  document.combo.forEach((entry, index) => {
    entry.forEach((keycode) => {
      if (typeof keycode === "string") check({ kind: "combo", index }, keycode);
    });
  });

  // 参照はできるが中身が空、という「押しても何も起きない」経路。
  for (const index of [...referencedTapDance].sort((a, b) => a - b)) {
    const entry = document.tapDance[index];
    if (entry === undefined) continue;
    if (entry.slice(0, 4).some((keycode) => keycode !== "KC_NO")) continue;
    diagnostics.push(
      createDiagnostic(
        "reference/empty-tap-dance",
        "warning",
        { kind: "tapDance", index },
        `TD(${index}) を参照しているが、tap dance ${index} は全て KC_NO で何も起きない`,
        { index },
      ),
    );
  }

  for (const index of [...referencedMacro].sort((a, b) => a - b)) {
    const entry = document.macro[index];
    if (Array.isArray(entry) && entry.length === 0) {
      diagnostics.push(
        createDiagnostic(
          "reference/empty-macro",
          "warning",
          { kind: "macro", index },
          `M${index} を参照しているが、macro ${index} は空で何も起きない`,
          { index },
        ),
      );
    }
  }

  return diagnostics;
}

function pushOutOfRange(
  diagnostics: Diagnostic[],
  subject: DiagnosticSubject,
  keycode: string,
  index: number,
  capacity: number,
  label: string,
): void {
  if (index < capacity) return;
  diagnostics.push(
    createDiagnostic(
      "reference/out-of-range",
      "warning",
      subject,
      `${keycode} は ${label} の容量 ${capacity} を超えている。Vial は無言で KC_NO へ落とす`,
      { keycode, index, capacity, target: label },
    ),
  );
}
