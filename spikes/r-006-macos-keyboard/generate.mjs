/**
 * R-006 Spike: QMK 表記の desired state から Karabiner-Elements の profile を組み立てる。
 *
 * 使い捨てのプロトタイプであって本実装ではない。判断の結果は
 * `docs/decisions/0022-macos-keyboard-management.md` にある。
 *
 * ここで確かめたいのは以下の 3 点だけ。
 *
 * 1. layer（MO / LT / TG）と tap-hold を Karabiner の manipulator へ落とせること
 * 2. 落とせない keycode を黙って捨てず diagnostic として返せること
 * 3. 出力が `karabiner_cli --lint-complex-modifications` を通ること
 */

/** layer 変数の名前空間。Karabiner の変数は global なので接頭辞で隔離する。 */
const LAYER_VARIABLE_PREFIX = "cornix_layer_";

/** 内蔵キーボードだけを対象にする条件。ADR 0022 の device スコープ。 */
const BUILT_IN_ONLY = { type: "device_if", identifiers: [{ is_built_in_keyboard: true }] };

/**
 * QMK keycode → Karabiner key_code。
 *
 * 網羅表ではない。Spike で必要な範囲だけを持つ。実装では
 * `src/core/keycode/` 側と対応づける（ADR 0022）。
 */
const KEY_CODES = new Map(
  Object.entries({
    KC_ESC: "escape",
    KC_TAB: "tab",
    KC_SPC: "spacebar",
    KC_ENT: "return_or_enter",
    KC_BSPC: "delete_or_backspace",
    KC_DEL: "delete_forward",
    KC_CAPS: "caps_lock",
    KC_LEFT: "left_arrow",
    KC_DOWN: "down_arrow",
    KC_UP: "up_arrow",
    KC_RGHT: "right_arrow",
    KC_HOME: "home",
    KC_END: "end",
    KC_PGUP: "page_up",
    KC_PGDN: "page_down",
    KC_MINS: "hyphen",
    KC_EQL: "equal_sign",
    KC_LBRC: "open_bracket",
    KC_RBRC: "close_bracket",
    KC_BSLS: "backslash",
    KC_SCLN: "semicolon",
    KC_QUOT: "quote",
    KC_GRV: "grave_accent_and_tilde",
    KC_COMM: "comma",
    KC_DOT: "period",
    KC_SLSH: "slash",
    // JIS。MacBook 内蔵キーボードの英数 / かなはこれ。
    KC_LANG1: "japanese_kana",
    KC_LANG2: "japanese_eisuu",
    KC_INT1: "international1",
    KC_INT3: "international3",
  }),
);
for (const letter of "abcdefghijklmnopqrstuvwxyz") {
  KEY_CODES.set(`KC_${letter.toUpperCase()}`, letter);
}
for (const digit of "1234567890") {
  KEY_CODES.set(`KC_${digit}`, digit);
}
for (let index = 1; index <= 12; index++) {
  KEY_CODES.set(`KC_F${index}`, `f${index}`);
}

/** modifier keycode → Karabiner key_code。mod-tap の hold 側にも使う。 */
const MODIFIERS = new Map(
  Object.entries({
    KC_LCTL: "left_control",
    KC_LSFT: "left_shift",
    KC_LALT: "left_option",
    KC_LGUI: "left_command",
    KC_RCTL: "right_control",
    KC_RSFT: "right_shift",
    KC_RALT: "right_option",
    KC_RGUI: "right_command",
  }),
);
for (const [keycode, karabiner] of MODIFIERS) KEY_CODES.set(keycode, karabiner);

const MOMENTARY = /^MO\((\d+)\)$/;
const LAYER_TAP = /^LT(\d+)\((.+)\)$/;
const TOGGLE = /^TG\((\d+)\)$/;
/** `LCTL_T(KC_ESC)` 形式の mod-tap。`ResolvedKeycode` に無いので Spike で追加する。 */
const MOD_TAP = /^([LR](?:CTL|SFT|ALT|GUI))_T\((.+)\)$/;

/**
 * keycode 文字列を意味へ解く。
 *
 * `src/core/keycode/table.ts` の `resolve` と同じ形にしてあるが、definition と capacities を
 * 取らない。Mac keyboard には definition も実機申告の容量も存在しないため（ADR 0022）。
 */
export function resolveKeycode(keycode) {
  if (keycode === "KC_TRNS" || keycode === "_______") return { kind: "transparent" };
  if (keycode === "KC_NO" || keycode === "XXXXXXX") return { kind: "none" };

  const momentary = MOMENTARY.exec(keycode);
  if (momentary) return { kind: "layerMomentary", layer: Number(momentary[1]) };

  const layerTap = LAYER_TAP.exec(keycode);
  if (layerTap) return { kind: "layerTap", layer: Number(layerTap[1]), inner: layerTap[2] };

  const toggle = TOGGLE.exec(keycode);
  if (toggle) return { kind: "layerToggle", layer: Number(toggle[1]) };

  const modTap = MOD_TAP.exec(keycode);
  if (modTap) return { kind: "modTap", modifier: `KC_${modTap[1]}`, inner: modTap[2] };

  const basic = KEY_CODES.get(keycode);
  if (basic !== undefined) return { kind: "basic", name: keycode, keyCode: basic };

  return { kind: "unsupported", name: keycode };
}

function layerVariable(layer) {
  return `${LAYER_VARIABLE_PREFIX}${layer}`;
}

/** layer n を条件に加える。layer 0 は無条件。 */
function conditionsFor(layer) {
  return layer === 0
    ? [BUILT_IN_ONLY]
    : [BUILT_IN_ONLY, { type: "variable_if", name: layerVariable(layer), value: 1 }];
}

/** どの layer の manipulator も修飾キーは素通しさせる。 */
function fromKey(keyCode) {
  return { key_code: keyCode, modifiers: { optional: ["any"] } };
}

/**
 * キー 1 つを manipulator の配列へ落とす。
 *
 * 返り値が空配列なら「manipulator を出さない」を意味する。Karabiner は
 * 書かれていないキーを素通しするので、`KC_TRNS` と layer 0 と同値のキーは
 * 出さないことがそのまま正しい挙動になる（ADR 0022）。
 */
function manipulatorsForKey(keyCode, keycode, layer, diagnostics) {
  const resolved = resolveKeycode(keycode);
  const conditions = conditionsFor(layer);
  const from = fromKey(keyCode);

  switch (resolved.kind) {
    case "transparent":
      return [];

    case "none":
      // `to` を書かない manipulator がイベントを捨てる。無効化はこれで表す。
      return [{ type: "basic", from, conditions }];

    case "basic":
      return [{ type: "basic", from, to: [{ key_code: resolved.keyCode }], conditions }];

    case "layerMomentary":
      return [
        {
          type: "basic",
          from,
          to: [{ set_variable: { name: layerVariable(resolved.layer), value: 1 } }],
          to_after_key_up: [{ set_variable: { name: layerVariable(resolved.layer), value: 0 } }],
          conditions,
        },
      ];

    case "layerTap": {
      const inner = resolveKeycode(resolved.inner);
      if (inner.kind !== "basic") {
        diagnostics.push({
          code: "macKeymap/unsupportedLayerTapInner",
          severity: "error",
          message: `LT${resolved.layer}(${resolved.inner}) の tap 側を Karabiner の key_code へ落とせない`,
          details: { layer, keyCode, keycode },
        });
        return [];
      }
      return [
        {
          type: "basic",
          from,
          to: [{ set_variable: { name: layerVariable(resolved.layer), value: 1 } }],
          to_after_key_up: [{ set_variable: { name: layerVariable(resolved.layer), value: 0 } }],
          to_if_alone: [{ key_code: inner.keyCode }],
          conditions,
        },
      ];
    }

    case "layerToggle": {
      // Karabiner に toggle は無い。variable_if で分岐した 2 本で表す。
      // 「立っているとき倒す」を先に置く。順序を逆にすると押した直後に立て直す。
      const variable = layerVariable(resolved.layer);
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

    case "modTap": {
      const modifier = MODIFIERS.get(resolved.modifier);
      const inner = resolveKeycode(resolved.inner);
      if (modifier === undefined || inner.kind !== "basic") {
        diagnostics.push({
          code: "macKeymap/unsupportedModTap",
          severity: "error",
          message: `${keycode} を Karabiner の mod-tap へ落とせない`,
          details: { layer, keyCode, keycode },
        });
        return [];
      }
      return [
        {
          type: "basic",
          from,
          // lazy を付けないと hold 側の modifier が単独で発火する。
          to: [{ key_code: modifier, lazy: true }],
          to_if_alone: [{ key_code: inner.keyCode }],
          conditions,
        },
      ];
    }

    case "unsupported":
      diagnostics.push({
        code: "macKeymap/unsupportedKeycode",
        severity: "error",
        message: `${keycode} に対応する Karabiner の key_code が無い`,
        details: { layer, keyCode, keycode },
      });
      return [];
  }
}

/**
 * desired state から Karabiner の rules を組み立てる。
 *
 * **rule は上から評価され最初にマッチしたものが勝つ**ため、高い layer から順に出す。
 * 逆順にすると layer 0 の割り当てが上の layer を食う。
 */
export function generateRules(desired) {
  const diagnostics = [];
  const rules = [];
  const base = desired.layers[0] ?? {};

  for (let layer = desired.layers.length - 1; layer >= 0; layer--) {
    const assignments = desired.layers[layer] ?? {};
    const manipulators = [];
    for (const keyCode of Object.keys(assignments).sort()) {
      const keycode = assignments[keyCode];
      // layer 0 と同値なら出さない。出しても素通しと同じ結果にしかならない。
      if (layer > 0 && base[keyCode] === keycode) continue;
      manipulators.push(...manipulatorsForKey(keyCode, keycode, layer, diagnostics));
    }
    if (manipulators.length === 0) continue;
    rules.push({
      description: `Cornix Bonsai layer ${layer}`,
      manipulators,
    });
  }

  return { rules, diagnostics };
}

/** Karabiner の complex_modifications asset 形式。`--lint-complex-modifications` の入力。 */
export function generateAsset(desired) {
  const { rules, diagnostics } = generateRules(desired);
  return { asset: { title: desired.profile, rules }, diagnostics };
}

/** karabiner.json の `profiles[]` へ差し込む profile 1 個。Cornix が所有する唯一の範囲。 */
export function generateProfile(desired) {
  const { rules, diagnostics } = generateRules(desired);
  return {
    profile: {
      name: desired.profile,
      // selected は触らない。切替はユーザーの操作（ADR 0022）。
      complex_modifications: { rules },
      virtual_hid_keyboard: { keyboard_type_v2: "ansi" },
    },
    diagnostics,
  };
}
