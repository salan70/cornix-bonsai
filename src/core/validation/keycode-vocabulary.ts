/**
 * QMK / Vial の keycode 語彙表。
 *
 * `docs/specs/semantic-model.md` が「QMK の基本 keycode 語彙の網羅は D-003 で扱う」と
 * 明記していた、その網羅がここ。
 *
 * **`core/keycode/table.ts` へ置かない**理由（ADR 0010）:
 *   - `createKeycodeTable` は definition と容量を引数に取る**解決**の責務で、
 *     解決できない表記は表記を保ったまま素通しする（ADR 0001・0006）
 *   - 「その表記を QMK の語彙として読めるか」は**判定**であり、出力は状態ではなく診断になる。
 *     素通しの方針を変えずに語彙を足せる場所は validation 側しかない
 *   - 語彙表は definition にも容量にも依存しない純粋な構文なので、factory にする理由が無い
 *
 * この表は**閉じた語彙ではない**。載っていない表記は `unknown` になり、
 * `reference/unknown-keycode` として warning で報告する。黙って `KC_NO` へ落とさない。
 */

/** keycode 文字列を構文だけで分類した結果。definition にも容量にも依存しない。 */
export type KeycodeLexeme =
  /** 語彙表にある基本 keycode。 */
  | { readonly kind: "basic"; readonly name: string }
  /** `LSFT(KC_1)` のような modifier 付き。 */
  | { readonly kind: "modified"; readonly modifier: string; readonly inner: string }
  /** `LSFT_T(KC_SPACE)` / `MT(mod, kc)` のような mod tap。 */
  | { readonly kind: "modTap"; readonly modifier: string; readonly inner: string }
  /** layer を操作する keycode。到達性解析はこれだけを見る。 */
  | {
      readonly kind: "layerSwitch";
      readonly action: LayerAction;
      readonly layer: number;
      readonly inner: string | undefined;
    }
  /** `OSM(MOD_LSFT)`。layer には触らない。 */
  | { readonly kind: "oneShotMod"; readonly modifier: string }
  /** `TD(n)`。index の妥当性は容量を知る `references.ts` が判定する。 */
  | { readonly kind: "tapDance"; readonly index: number }
  /** `M(n)`。 */
  | { readonly kind: "macro"; readonly index: number }
  /** `USERnn`。意味は definition 依存なのでここでは index しか分からない（ADR 0002）。 */
  | { readonly kind: "custom"; readonly index: number }
  | { readonly kind: "none" }
  | { readonly kind: "transparent" }
  /** `0x1234` のような数値表記。Vial は受け付けるが意味は追えない。 */
  | { readonly kind: "numeric"; readonly value: number }
  /** 語彙表に無い表記。 */
  | { readonly kind: "unknown"; readonly name: string };

/** layer をどう操作するか。`momentary` と `layerTap` は離せば戻る。 */
export type LayerAction =
  | "momentary"
  | "layerTap"
  | "toggle"
  | "to"
  | "tapToggle"
  | "default"
  | "oneShot"
  | "layerMod";

/** 押している間だけ有効な layer 操作か。閉じ込め判定（`reachability.ts`）で使う。 */
export function isMomentaryLayerAction(action: LayerAction): boolean {
  return action === "momentary" || action === "layerTap" || action === "layerMod";
}

const RANGE = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, offset) => `${prefix}${from + offset}`);

const LETTERS = Array.from({ length: 26 }, (_, index) => `KC_${String.fromCharCode(65 + index)}`);

/**
 * 基本 keycode の語彙。vial-gui の `Keycode.serialize` が書き出す長い表記を正とする。
 * 短い alias（`KC_BSPC` など）は `core/diff/describe.ts` の alias 表が吸収する。
 */
export const BASIC_KEYCODES: ReadonlySet<string> = new Set<string>([
  ...LETTERS,
  ...RANGE("KC_", 1, 9),
  "KC_0",
  ...RANGE("KC_F", 1, 24),
  ...RANGE("KC_KP_", 1, 9),
  "KC_KP_0",
  ...RANGE("KC_LANG", 1, 9),
  ...RANGE("KC_INT", 1, 9),
  ...RANGE("KC_ACL", 0, 2),
  ...RANGE("KC_BTN", 1, 5),
  // 記号・編集
  "KC_ENTER",
  "KC_ESCAPE",
  "KC_BSPACE",
  "KC_TAB",
  "KC_SPACE",
  "KC_MINUS",
  "KC_EQUAL",
  "KC_LBRACKET",
  "KC_RBRACKET",
  "KC_BSLASH",
  "KC_NONUS_HASH",
  "KC_SCOLON",
  "KC_QUOTE",
  "KC_GRAVE",
  "KC_COMMA",
  "KC_DOT",
  "KC_SLASH",
  "KC_CAPSLOCK",
  "KC_NONUS_BSLASH",
  // shift 済みの別名 keycode（QMK では独立した keycode）
  "KC_TILD",
  "KC_EXLM",
  "KC_AT",
  "KC_HASH",
  "KC_DLR",
  "KC_PERC",
  "KC_CIRC",
  "KC_AMPR",
  "KC_ASTR",
  "KC_LPRN",
  "KC_RPRN",
  "KC_UNDS",
  "KC_PLUS",
  "KC_LCBR",
  "KC_RCBR",
  "KC_PIPE",
  "KC_COLN",
  "KC_DQUO",
  "KC_LT",
  "KC_GT",
  "KC_QUES",
  // 移動・編集
  "KC_PSCREEN",
  "KC_SCROLLLOCK",
  "KC_PAUSE",
  "KC_INSERT",
  "KC_HOME",
  "KC_PGUP",
  "KC_DELETE",
  "KC_END",
  "KC_PGDOWN",
  "KC_RIGHT",
  "KC_LEFT",
  "KC_DOWN",
  "KC_UP",
  "KC_APPLICATION",
  "KC_EXECUTE",
  "KC_HELP",
  "KC_MENU",
  "KC_SELECT",
  "KC_STOP",
  "KC_AGAIN",
  "KC_UNDO",
  "KC_CUT",
  "KC_COPY",
  "KC_PASTE",
  "KC_FIND",
  "KC_ALT_ERASE",
  "KC_SYSREQ",
  "KC_CANCEL",
  "KC_CLEAR",
  "KC_PRIOR",
  "KC_SEPARATOR",
  "KC_OUT",
  "KC_OPER",
  "KC_CLEAR_AGAIN",
  "KC_CRSEL",
  "KC_EXSEL",
  // keypad
  "KC_NUMLOCK",
  "KC_KP_SLASH",
  "KC_KP_ASTERISK",
  "KC_KP_MINUS",
  "KC_KP_PLUS",
  "KC_KP_ENTER",
  "KC_KP_DOT",
  "KC_KP_EQUAL",
  "KC_KP_COMMA",
  // modifier
  "KC_LCTRL",
  "KC_LSHIFT",
  "KC_LALT",
  "KC_LGUI",
  "KC_RCTRL",
  "KC_RSHIFT",
  "KC_RALT",
  "KC_RGUI",
  "KC_LOCKING_CAPS",
  "KC_LOCKING_NUM",
  "KC_LOCKING_SCROLL",
  // media / system
  "KC_MUTE",
  "KC_VOLU",
  "KC_VOLD",
  "KC_MNXT",
  "KC_MPRV",
  "KC_MSTP",
  "KC_MPLY",
  "KC_MSEL",
  "KC_MFFD",
  "KC_MRWD",
  "KC_EJCT",
  "KC_PWR",
  "KC_SLEP",
  "KC_WAKE",
  "KC_CALC",
  "KC_MAIL",
  "KC_MYCM",
  "KC_WSCH",
  "KC_WHOM",
  "KC_WBAK",
  "KC_WFWD",
  "KC_WSTP",
  "KC_WREF",
  "KC_WFAV",
  "KC_BRIU",
  "KC_BRID",
  "KC_POWER",
  "KC_ASSISTANT",
  "KC_MISSION_CONTROL",
  "KC_LAUNCHPAD",
  // mouse
  "KC_MS_UP",
  "KC_MS_DOWN",
  "KC_MS_LEFT",
  "KC_MS_RIGHT",
  "KC_MS_U",
  "KC_MS_D",
  "KC_MS_L",
  "KC_MS_R",
  "KC_WH_U",
  "KC_WH_D",
  "KC_WH_L",
  "KC_WH_R",
  // QMK 固有の複合キー
  "KC_GESC",
  "KC_LSPO",
  "KC_RSPC",
  "KC_LCPO",
  "KC_RCPC",
  "KC_LAPO",
  "KC_RAPC",
  "KC_SFTENT",
  "KC_LEAD",
  "KC_LOCK",
  "KC_REPEAT",
  "KC_ALT_REPEAT",
  // quantum
  "RESET",
  "DEBUG",
  "EE_CLR",
  "DB_TOGG",
  "CAPS_WORD",
  "QK_BOOT",
]);

/**
 * alias → vial-gui が書き出す長い表記。
 *
 * 網羅を目的にしない。**比較に効くのは「同じ挙動を別表記にした変更を差分から外す」ときだけ**で、
 * 表に無い alias は通常の変更として出る（安全側）。
 */
export const KEYCODE_ALIASES: ReadonlyMap<string, string> = new Map<string, string>([
  ["KC_BSPC", "KC_BSPACE"],
  ["KC_ENT", "KC_ENTER"],
  ["KC_ESC", "KC_ESCAPE"],
  ["KC_SPC", "KC_SPACE"],
  ["KC_MINS", "KC_MINUS"],
  ["KC_EQL", "KC_EQUAL"],
  ["KC_LBRC", "KC_LBRACKET"],
  ["KC_RBRC", "KC_RBRACKET"],
  ["KC_BSLS", "KC_BSLASH"],
  ["KC_SCLN", "KC_SCOLON"],
  ["KC_QUOT", "KC_QUOTE"],
  ["KC_GRV", "KC_GRAVE"],
  ["KC_COMM", "KC_COMMA"],
  ["KC_SLSH", "KC_SLASH"],
  ["KC_CAPS", "KC_CAPSLOCK"],
  ["KC_LSFT", "KC_LSHIFT"],
  ["KC_RSFT", "KC_RSHIFT"],
  ["KC_LCTL", "KC_LCTRL"],
  ["KC_RCTL", "KC_RCTRL"],
  ["KC_PSCR", "KC_PSCREEN"],
  ["KC_SLCK", "KC_SCROLLLOCK"],
  ["KC_PGDN", "KC_PGDOWN"],
  ["KC_INS", "KC_INSERT"],
  ["KC_DEL", "KC_DELETE"],
  ["KC_APP", "KC_APPLICATION"],
  ["KC_NUHS", "KC_NONUS_HASH"],
  ["KC_NUBS", "KC_NONUS_BSLASH"],
  ["KC_NLCK", "KC_NUMLOCK"],
  ["KC_PSLS", "KC_KP_SLASH"],
  ["KC_PAST", "KC_KP_ASTERISK"],
  ["KC_PMNS", "KC_KP_MINUS"],
  ["KC_PPLS", "KC_KP_PLUS"],
  ["KC_PENT", "KC_KP_ENTER"],
  ["KC_PDOT", "KC_KP_DOT"],
  ["KC_PEQL", "KC_KP_EQUAL"],
  ["KC_PCMM", "KC_KP_COMMA"],
  ["KC_MS_U", "KC_MS_UP"],
  ["KC_MS_D", "KC_MS_DOWN"],
  ["KC_MS_L", "KC_MS_LEFT"],
  ["KC_MS_R", "KC_MS_RIGHT"],
  ["KC_TRANSPARENT", "KC_TRNS"],
  ["KC_TRANS", "KC_TRNS"],
]);

const WRAPPER_PATTERN = /^([A-Z_0-9]+)\((.+)\)$/;

/**
 * alias を長い表記へ畳む。**保存にも export にも使わない**（ADR 0001）。
 * 「表記だけの差」を判定するためだけの純関数。
 *
 * @doc docs/specs/validation.md#canonicalkeycode
 */
export function canonicalKeycode(keycode: string): string {
  const wrapped = WRAPPER_PATTERN.exec(keycode);
  if (wrapped?.[1] !== undefined && wrapped[2] !== undefined) {
    const inner = wrapped[2]
      .split(",")
      .map((part) => canonicalKeycode(part.trim()))
      .join(", ");
    return `${wrapped[1]}(${inner})`;
  }
  return KEYCODE_ALIASES.get(keycode) ?? keycode;
}

/** modifier 括弧の名前。`SGUI(KC_2)` のような複合も含む。 */
const MODIFIER_WRAPPERS: ReadonlySet<string> = new Set<string>([
  "LCTL",
  "LSFT",
  "LALT",
  "LGUI",
  "RCTL",
  "RSFT",
  "RALT",
  "RGUI",
  "HYPR",
  "MEH",
  "ALL",
  "LCAG",
  "RCAG",
  "SGUI",
  "SCMD",
  "SWIN",
  "RSG",
  "RCS",
  "LCA",
  "LSA",
  "RSA",
  "LCS",
  "LCG",
  "RCG",
  "C_S",
  "LAG",
  "RAG",
]);

const MODIFIED_PATTERN = /^([A-Z_0-9]+)\((.+)\)$/;
const MOD_TAP_PATTERN = /^([A-Z_0-9]+)_T\((.+)\)$/;
const LAYER_TAP_PAREN_PATTERN = /^LT\((\d+),\s*(.+)\)$/;
const LAYER_TAP_SUFFIX_PATTERN = /^LT(\d+)\((.+)\)$/;
const LAYER_MOD_PATTERN = /^LM\((\d+),\s*(.+)\)$/;
const ONE_SHOT_MOD_PATTERN = /^OSM\((.+)\)$/;
const NUMERIC_PATTERN = /^(0[xX][0-9a-fA-F]+|\d+)$/;
const CUSTOM_PATTERN = /^USER(\d{2})$/;
const TAP_DANCE_PATTERN = /^TD\((\d+)\)$/;
const MACRO_PATTERN = /^M\((\d+)\)$/;

const LAYER_WRAPPERS: ReadonlyMap<string, LayerAction> = new Map<string, LayerAction>([
  ["MO", "momentary"],
  ["TO", "to"],
  ["TG", "toggle"],
  ["TT", "tapToggle"],
  ["DF", "default"],
  ["OSL", "oneShot"],
]);

/**
 * keycode 文字列を構文だけで分類する。
 *
 * definition も容量も引数に取らない。したがってここでは
 * 「`USER99` は custom keycode の 99 番」までしか言えず、それが実在するかは判定しない。
 * 実在の判定は definition と容量を持つ `references.ts` の責務（ADR 0002・0003）。
 *
 * @doc docs/specs/validation.md#classifykeycode
 */
export function classifyKeycode(keycode: string): KeycodeLexeme {
  if (keycode === "KC_NO") return { kind: "none" };
  if (keycode === "KC_TRNS" || keycode === "KC_TRANSPARENT" || keycode === "KC_TRANS") {
    return { kind: "transparent" };
  }
  // alias（`KC_BSPC`）も語彙として受ける。表記は畳まずそのまま返す（ADR 0001）。
  const canonical = canonicalKeycode(keycode);
  if (BASIC_KEYCODES.has(keycode) || BASIC_KEYCODES.has(canonical)) {
    return { kind: "basic", name: keycode };
  }
  if (canonical === "KC_TRNS") return { kind: "transparent" };

  const numeric = NUMERIC_PATTERN.exec(keycode);
  if (numeric?.[1] !== undefined) return { kind: "numeric", value: Number(numeric[1]) };

  const custom = CUSTOM_PATTERN.exec(keycode);
  if (custom?.[1] !== undefined) return { kind: "custom", index: Number(custom[1]) };

  const tapDance = TAP_DANCE_PATTERN.exec(keycode);
  if (tapDance?.[1] !== undefined) return { kind: "tapDance", index: Number(tapDance[1]) };

  const macro = MACRO_PATTERN.exec(keycode);
  if (macro?.[1] !== undefined) return { kind: "macro", index: Number(macro[1]) };

  // `LT(1, kc)` と `LT1(kc)` の両方を受ける。Vial の出力は後者（ADR 0001）。
  const layerTap = LAYER_TAP_PAREN_PATTERN.exec(keycode) ?? LAYER_TAP_SUFFIX_PATTERN.exec(keycode);
  if (layerTap?.[1] !== undefined && layerTap[2] !== undefined) {
    return {
      kind: "layerSwitch",
      action: "layerTap",
      layer: Number(layerTap[1]),
      inner: layerTap[2],
    };
  }

  const layerMod = LAYER_MOD_PATTERN.exec(keycode);
  if (layerMod?.[1] !== undefined && layerMod[2] !== undefined) {
    return {
      kind: "layerSwitch",
      action: "layerMod",
      layer: Number(layerMod[1]),
      inner: layerMod[2],
    };
  }

  const oneShotMod = ONE_SHOT_MOD_PATTERN.exec(keycode);
  if (oneShotMod?.[1] !== undefined) return { kind: "oneShotMod", modifier: oneShotMod[1] };

  const modTap = MOD_TAP_PATTERN.exec(keycode);
  if (modTap?.[1] !== undefined && modTap[2] !== undefined && MODIFIER_WRAPPERS.has(modTap[1])) {
    return { kind: "modTap", modifier: modTap[1], inner: modTap[2] };
  }

  const modified = MODIFIED_PATTERN.exec(keycode);
  if (modified?.[1] !== undefined && modified[2] !== undefined) {
    const wrapper = modified[1];
    const inner = modified[2];

    const layerAction = LAYER_WRAPPERS.get(wrapper);
    if (layerAction !== undefined && /^\d+$/.test(inner)) {
      return { kind: "layerSwitch", action: layerAction, layer: Number(inner), inner: undefined };
    }
    if (MODIFIER_WRAPPERS.has(wrapper)) {
      return { kind: "modified", modifier: wrapper, inner };
    }
    if (wrapper === "MT") {
      const [modifier, ...rest] = inner.split(",");
      if (modifier !== undefined && rest.length > 0) {
        return { kind: "modTap", modifier: modifier.trim(), inner: rest.join(",").trim() };
      }
    }
  }

  return { kind: "unknown", name: keycode };
}

/**
 * 語彙表として読めた表記か。
 *
 * `unknown` だけが false になる。`numeric` は「読めたが意味は追えない」で、
 * severity が違うので別扱いにする（ADR 0010）。
 */
export function isKnownKeycode(keycode: string): boolean {
  return classifyKeycode(keycode).kind !== "unknown";
}
