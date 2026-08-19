/** `.vil`のkeycode表記をVial protocol 6のu16へ変換するfail-closed encoder。 */

import { canonicalKeycode } from "../validation/keycode-vocabulary.ts";

/** Vialが安全にwire値へ変換できないkeycode表記を受け取った。 */
export class KeycodeEncodingError extends Error {}

const LETTERS = Object.fromEntries(
  Array.from({ length: 26 }, (_, index) => [`KC_${String.fromCharCode(65 + index)}`, 0x04 + index]),
);
const DIGITS = Object.fromEntries(
  Array.from({ length: 9 }, (_, index) => [`KC_${index + 1}`, 0x1e + index]),
);
const FUNCTIONS = Object.fromEntries(
  Array.from({ length: 24 }, (_, index) => [
    `KC_F${index + 1}`,
    index < 12 ? 0x3a + index : 0x68 + index - 12,
  ]),
);

const BASIC: Readonly<Record<string, number>> = {
  ...LETTERS,
  ...DIGITS,
  ...FUNCTIONS,
  KC_0: 0x27,
  KC_NO: 0x00,
  KC_TRNS: 0x01,
  KC_ENTER: 0x28,
  KC_ESCAPE: 0x29,
  KC_BSPACE: 0x2a,
  KC_TAB: 0x2b,
  KC_SPACE: 0x2c,
  KC_MINUS: 0x2d,
  KC_EQUAL: 0x2e,
  KC_LBRACKET: 0x2f,
  KC_RBRACKET: 0x30,
  KC_BSLASH: 0x31,
  KC_NONUS_HASH: 0x32,
  KC_SCOLON: 0x33,
  KC_QUOTE: 0x34,
  KC_GRAVE: 0x35,
  KC_COMMA: 0x36,
  KC_DOT: 0x37,
  KC_SLASH: 0x38,
  KC_CAPSLOCK: 0x39,
  KC_PSCREEN: 0x46,
  KC_SCROLLLOCK: 0x47,
  KC_PAUSE: 0x48,
  KC_INSERT: 0x49,
  KC_HOME: 0x4a,
  KC_PGUP: 0x4b,
  KC_DELETE: 0x4c,
  KC_END: 0x4d,
  KC_PGDOWN: 0x4e,
  KC_RIGHT: 0x4f,
  KC_LEFT: 0x50,
  KC_DOWN: 0x51,
  KC_UP: 0x52,
  KC_NUMLOCK: 0x53,
  KC_KP_SLASH: 0x54,
  KC_KP_ASTERISK: 0x55,
  KC_KP_MINUS: 0x56,
  KC_KP_PLUS: 0x57,
  KC_KP_ENTER: 0x58,
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`KC_KP_${index + 1}`, 0x59 + index]),
  ),
  KC_KP_0: 0x62,
  KC_KP_DOT: 0x63,
  KC_NONUS_BSLASH: 0x64,
  KC_APPLICATION: 0x65,
  KC_KP_EQUAL: 0x67,
  KC_KP_COMMA: 0x85,
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`KC_INT${index + 1}`, 0x87 + index]),
  ),
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`KC_LANG${index + 1}`, 0x90 + index]),
  ),
  KC_LCTRL: 0xe0,
  KC_LSHIFT: 0xe1,
  KC_LALT: 0xe2,
  KC_LGUI: 0xe3,
  KC_RCTRL: 0xe4,
  KC_RSHIFT: 0xe5,
  KC_RALT: 0xe6,
  KC_RGUI: 0xe7,
  KC_PWR: 0xa5,
  KC_SLEP: 0xa6,
  KC_WAKE: 0xa7,
  KC_MUTE: 0xa8,
  KC_VOLU: 0xa9,
  KC_VOLD: 0xaa,
  KC_MNXT: 0xab,
  KC_MPRV: 0xac,
  KC_MSTP: 0xad,
  KC_MPLY: 0xae,
  KC_MSEL: 0xaf,
  KC_EJCT: 0xb0,
  KC_MAIL: 0xb1,
  KC_CALC: 0xb2,
  KC_MYCM: 0xb3,
  KC_WSCH: 0xb4,
  KC_WHOM: 0xb5,
  KC_WBAK: 0xb6,
  KC_WFWD: 0xb7,
  KC_WSTP: 0xb8,
  KC_WREF: 0xb9,
  KC_WFAV: 0xba,
  KC_MFFD: 0xbb,
  KC_MRWD: 0xbc,
  KC_BRIU: 0xbd,
  KC_BRID: 0xbe,
  KC_MS_UP: 0xcd,
  KC_MS_DOWN: 0xce,
  KC_MS_LEFT: 0xcf,
  KC_MS_RIGHT: 0xd0,
  ...Object.fromEntries(
    Array.from({ length: 5 }, (_, index) => [`KC_BTN${index + 1}`, 0xd1 + index]),
  ),
  KC_WH_U: 0xd9,
  KC_WH_D: 0xda,
  KC_WH_L: 0xdb,
  KC_WH_R: 0xdc,
  ...Object.fromEntries(Array.from({ length: 3 }, (_, index) => [`KC_ACL${index}`, 0xdd + index])),
  KC_GESC: 0x7c16,
  KC_LSPO: 0x7c1a,
  KC_RSPC: 0x7c1b,
  KC_LCPO: 0x7c18,
  KC_RCPC: 0x7c19,
  KC_LAPO: 0x7c1c,
  KC_RAPC: 0x7c1d,
  KC_SFTENT: 0x7c1e,
};

const SHIFTED: Readonly<Record<string, string>> = {
  KC_TILD: "KC_GRAVE",
  KC_EXLM: "KC_1",
  KC_AT: "KC_2",
  KC_HASH: "KC_3",
  KC_DLR: "KC_4",
  KC_PERC: "KC_5",
  KC_CIRC: "KC_6",
  KC_AMPR: "KC_7",
  KC_ASTR: "KC_8",
  KC_LPRN: "KC_9",
  KC_RPRN: "KC_0",
  KC_UNDS: "KC_MINUS",
  KC_PLUS: "KC_EQUAL",
  KC_LCBR: "KC_LBRACKET",
  KC_RCBR: "KC_RBRACKET",
  KC_PIPE: "KC_BSLASH",
  KC_COLN: "KC_SCOLON",
  KC_DQUO: "KC_QUOTE",
  KC_LT: "KC_COMMA",
  KC_GT: "KC_DOT",
  KC_QUES: "KC_SLASH",
};

const MODIFIERS: Readonly<Record<string, number>> = {
  LCTL: 0x01,
  LSFT: 0x02,
  LALT: 0x04,
  LGUI: 0x08,
  RCTL: 0x11,
  RSFT: 0x12,
  RALT: 0x14,
  RGUI: 0x18,
  C_S: 0x03,
  LCS: 0x03,
  LCA: 0x05,
  LSA: 0x06,
  MEH: 0x07,
  LCG: 0x09,
  SGUI: 0x0a,
  LSG: 0x0a,
  LAG: 0x0c,
  LCAG: 0x0d,
  HYPR: 0x0f,
  ALL: 0x0f,
  RCG: 0x19,
  RCAG: 0x1d,
};

/** Vial protocol 6のkeycode表記をu16へ変換する。未対応表記は`KC_NO`へ落とさず拒否する。 */
export function encodeVialKeycode(keycode: string, protocol: number): number {
  if (protocol !== 6) {
    throw new KeycodeEncodingError(`Vial protocol ${protocol} のkeycode変換は未対応`);
  }
  const canonical = canonicalKeycode(keycode);
  if (/^(?:0[xX][0-9a-fA-F]+|\d+)$/.test(canonical)) {
    return assertU16(Number(canonical), keycode);
  }
  const basic = BASIC[canonical];
  if (basic !== undefined) return basic;
  const shifted = SHIFTED[canonical];
  if (shifted !== undefined) return 0x0200 | requireBasic(shifted, keycode);

  const indexed = /^(MO|TO|DF|TG|OSL|TT)\((\d+)\)$/.exec(canonical);
  if (indexed?.[1] !== undefined && indexed[2] !== undefined) {
    const base = { MO: 0x5220, TO: 0x5200, DF: 0x5240, TG: 0x5260, OSL: 0x5280, TT: 0x52c0 }[
      indexed[1]
    ];
    if (base !== undefined) return base | (Number(indexed[2]) & 0x1f);
  }
  const layerTap = /^(?:LT\((\d+),\s*(.+)\)|LT(\d+)\((.+)\))$/.exec(canonical);
  if (layerTap !== null) {
    const layer = Number(layerTap[1] ?? layerTap[3]);
    const inner = layerTap[2] ?? layerTap[4];
    if (inner !== undefined) return 0x4000 | ((layer & 0x0f) << 8) | requireBasic(inner, keycode);
  }
  const tapDance = /^TD\((\d+)\)$/.exec(canonical);
  if (tapDance?.[1] !== undefined) return 0x5700 | (Number(tapDance[1]) & 0xff);
  const macro = /^M\((\d+)\)$/.exec(canonical);
  if (macro?.[1] !== undefined) return 0x7700 | (Number(macro[1]) & 0x7f);
  const custom = /^USER(\d{2})$/.exec(canonical);
  if (custom?.[1] !== undefined) return 0x7e00 | Number(custom[1]);

  const modTap = /^([A-Z_0-9]+)_T\((.+)\)$/.exec(canonical);
  if (modTap?.[1] !== undefined && modTap[2] !== undefined) {
    const modifier = MODIFIERS[modTap[1]];
    if (modifier !== undefined) {
      return 0x2000 | ((modifier & 0x1f) << 8) | requireBasic(modTap[2], keycode);
    }
  }
  const modified = /^([A-Z_0-9]+)\((.+)\)$/.exec(canonical);
  if (modified?.[1] !== undefined && modified[2] !== undefined) {
    const modifier = MODIFIERS[modified[1]];
    if (modifier !== undefined) return (modifier << 8) | requireBasic(modified[2], keycode);
  }

  throw new KeycodeEncodingError(`keycode ${keycode} をVial protocol 6のwire値へ変換できない`);
}

function requireBasic(keycode: string, source: string): number {
  const encoded = encodeVialKeycode(keycode.trim(), 6);
  if (encoded > 0xff) {
    throw new KeycodeEncodingError(`keycode ${source} のinner keycodeが8bitではない`);
  }
  return encoded;
}

function assertU16(value: number, source: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new KeycodeEncodingError(`keycode ${source} はu16の範囲外`);
  }
  return value;
}
