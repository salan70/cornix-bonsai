/**
 * desired state → Karabiner の rules。
 *
 * 展開規則は ADR 0022、構文層の出どころは ADR 0023。R-006 Spike
 * （`spikes/r-006-macos-keyboard/generate.mjs`）のプロトタイプを本実装へ移したもので、
 * `resolveKeycode` は持たず `classifyKeycode` の `KeycodeLexeme` から直接写像する。
 *
 * 落とせない keycode は**黙って捨てず** error の diagnostic にする。Karabiner は
 * 書かれていないキーを素通しするため、捨てると「効かないキー」として静かに残る。
 *
 */

import { classifyKeycode } from "../validation/keycode-vocabulary.ts";
import { createDiagnostic, type Diagnostic } from "../validation/types.ts";
import { KARABINER_MODIFIERS, karabinerKeyCode } from "./key-codes.ts";
import type {
  KarabinerAsset,
  KarabinerCondition,
  KarabinerFrom,
  KarabinerManipulator,
  KarabinerProfile,
  KarabinerRule,
} from "./karabiner.ts";
import type { MacKeymapDocument } from "./types.ts";

/** layer 変数の名前空間。Karabiner の変数は global なので接頭辞で隔離する。 */
const LAYER_VARIABLE_PREFIX = "cornix_layer_";

/** 内蔵キーボードだけを対象にする条件。ADR 0022 の device スコープ。 */
const BUILT_IN_ONLY: KarabinerCondition = {
  type: "device_if",
  identifiers: [{ is_built_in_keyboard: true }],
};

/** 生成結果。manipulator が出ない理由は必ず diagnostic か「素通しで正しい」のどちらか。 */
export interface GeneratedRules {
  readonly rules: readonly KarabinerRule[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * desired state から rules を組み立てる。
 *
 * **rule は上から評価され最初にマッチしたものが勝つ**ため、高い layer から順に出す。
 * 逆順にすると layer 0 の割り当てが上の layer を食う（ADR 0022）。
 *
 * @doc docs/specs/mac-keymap.md#generatekarabinerrules
 */
export function generateKarabinerRules(document: MacKeymapDocument): GeneratedRules {
  const diagnostics: Diagnostic[] = [];
  const rules: KarabinerRule[] = [];
  const base = document.layers.get(0);
  const layers = [...document.layers.keys()].sort((a, b) => b - a);

  for (const layer of layers) {
    const assignments = document.layers.get(layer);
    if (assignments === undefined) continue;
    const manipulators: KarabinerManipulator[] = [];
    for (const keyCode of [...assignments.keys()].sort()) {
      const keycode = assignments.get(keyCode);
      if (keycode === undefined) continue;
      // layer 0 と同値なら出さない。出しても素通しと同じ結果にしかならない。
      if (layer > 0 && base?.get(keyCode) === keycode) continue;
      manipulators.push(...manipulatorsForKey(keyCode, keycode, layer, diagnostics));
    }
    if (manipulators.length === 0) continue;
    rules.push({ description: `${document.profile} layer ${layer}`, manipulators });
  }

  return { rules, diagnostics };
}

/**
 * `karabiner_cli --lint-complex-modifications` が受け取る asset 形式。
 *
 * @doc docs/specs/mac-keymap.md#generatekarabinerasset
 */
export function generateKarabinerAsset(document: MacKeymapDocument): {
  readonly asset: KarabinerAsset;
  readonly diagnostics: readonly Diagnostic[];
} {
  const { rules, diagnostics } = generateKarabinerRules(document);
  return { asset: { title: document.profile, rules }, diagnostics };
}

/**
 * `karabiner.json` の `profiles[]` へ差し込む profile 1 個。Cornix が所有する唯一の範囲。
 *
 * `selected` は持たせない。profile の切り替えはユーザーの操作（ADR 0022）。
 *
 * @doc docs/specs/mac-keymap.md#generatecornixprofile
 */
export function generateCornixProfile(document: MacKeymapDocument): {
  readonly profile: KarabinerProfile;
  readonly diagnostics: readonly Diagnostic[];
} {
  const { rules, diagnostics } = generateKarabinerRules(document);
  return {
    profile: {
      name: document.profile,
      complex_modifications: { rules },
      virtual_hid_keyboard: { keyboard_type_v2: "ansi" },
    },
    diagnostics,
  };
}

function layerVariable(layer: number): string {
  return `${LAYER_VARIABLE_PREFIX}${layer}`;
}

/** layer n を条件に加える。layer 0 は無条件。 */
function conditionsFor(layer: number): readonly KarabinerCondition[] {
  return layer === 0
    ? [BUILT_IN_ONLY]
    : [BUILT_IN_ONLY, { type: "variable_if", name: layerVariable(layer), value: 1 }];
}

/** どの layer の manipulator も修飾キーは素通しさせる。 */
function fromKey(keyCode: string): KarabinerFrom {
  return { key_code: keyCode, modifiers: { optional: ["any"] } };
}

function unsupported(
  code: string,
  layer: number,
  keyCode: string,
  keycode: string,
  message: string,
): Diagnostic {
  return createDiagnostic(code, "error", { kind: "macKey", layer, keyCode }, message, {
    keyCode,
    keycode,
  });
}

/**
 * キー 1 つを manipulator の配列へ落とす。
 *
 * 空配列は「manipulator を出さない」を意味する。Karabiner は書かれていないキーを
 * 素通しするので、`KC_TRNS` と layer 0 と同値のキーは出さないことがそのまま
 * 正しい挙動になる（ADR 0022）。
 */
function manipulatorsForKey(
  keyCode: string,
  keycode: string,
  layer: number,
  diagnostics: Diagnostic[],
): readonly KarabinerManipulator[] {
  const lexeme = classifyKeycode(keycode);
  const conditions = conditionsFor(layer);
  const from = fromKey(keyCode);

  switch (lexeme.kind) {
    case "transparent":
      return [];

    case "none":
      // `to` を書かない manipulator がイベントを捨てる。無効化はこれで表す。
      return [{ type: "basic", from, conditions }];

    case "basic": {
      const to = karabinerKeyCode(lexeme.name);
      if (to === undefined) {
        diagnostics.push(
          unsupported(
            "mac-keymap/unsupported-keycode",
            layer,
            keyCode,
            keycode,
            `${keycode} に対応する Karabiner の key_code が無い`,
          ),
        );
        return [];
      }
      return [{ type: "basic", from, to: [{ key_code: to }], conditions }];
    }

    case "layerSwitch": {
      const variable = layerVariable(lexeme.layer);
      if (lexeme.action === "momentary") {
        return [
          {
            type: "basic",
            from,
            to: [{ set_variable: { name: variable, value: 1 } }],
            to_after_key_up: [{ set_variable: { name: variable, value: 0 } }],
            conditions,
          },
        ];
      }
      if (lexeme.action === "layerTap") {
        const inner = lexeme.inner === undefined ? undefined : karabinerKeyCode(lexeme.inner);
        if (inner === undefined) {
          diagnostics.push(
            unsupported(
              "mac-keymap/unsupported-layer-tap-inner",
              layer,
              keyCode,
              keycode,
              `${keycode} の tap 側を Karabiner の key_code へ落とせない`,
            ),
          );
          return [];
        }
        return [
          {
            type: "basic",
            from,
            to: [{ set_variable: { name: variable, value: 1 } }],
            to_after_key_up: [{ set_variable: { name: variable, value: 0 } }],
            to_if_alone: [{ key_code: inner }],
            conditions,
          },
        ];
      }
      if (lexeme.action === "toggle") {
        // Karabiner に toggle は無い。variable_if で分岐した 2 本で表す。
        // 「立っているとき倒す」を先に置く。順序を逆にすると押した直後に立て直す。
        return [
          {
            type: "basic",
            from,
            to: [{ set_variable: { name: variable, value: 0 } }],
            conditions: [...conditions, { type: "variable_if", name: variable, value: 1 }],
          },
          {
            type: "basic",
            from,
            to: [{ set_variable: { name: variable, value: 1 } }],
            conditions: [...conditions, { type: "variable_unless", name: variable, value: 1 }],
          },
        ];
      }
      diagnostics.push(
        unsupported(
          "mac-keymap/unsupported-keycode",
          layer,
          keyCode,
          keycode,
          `${keycode} の layer 操作は Karabiner へ落とせない（対応するのは MO / LT / TG）`,
        ),
      );
      return [];
    }

    case "modTap": {
      const modifier = KARABINER_MODIFIERS.get(lexeme.modifier);
      const inner = karabinerKeyCode(lexeme.inner);
      if (modifier === undefined || inner === undefined) {
        diagnostics.push(
          unsupported(
            "mac-keymap/unsupported-mod-tap",
            layer,
            keyCode,
            keycode,
            `${keycode} を Karabiner の mod-tap へ落とせない`,
          ),
        );
        return [];
      }
      return [
        {
          type: "basic",
          from,
          // lazy を付けないと hold 側の modifier が単独で発火する。
          to: [{ key_code: modifier, lazy: true }],
          to_if_alone: [{ key_code: inner }],
          conditions,
        },
      ];
    }

    case "modified":
    case "oneShotMod":
    case "tapDance":
    case "macro":
    case "custom":
    case "numeric":
    case "unknown":
      diagnostics.push(
        unsupported(
          "mac-keymap/unsupported-keycode",
          layer,
          keyCode,
          keycode,
          `${keycode} は Karabiner へ落とせない`,
        ),
      );
      return [];
  }
}
