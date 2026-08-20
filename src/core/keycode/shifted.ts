/** shift を伴う basic keycode と、その base keycode の対応。 */
export const SHIFTED_TO_BASE: Readonly<Record<string, string>> = {
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

/** base keycode から shift 済み keycode を引く逆引き表。 */
export const BASE_TO_SHIFTED: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SHIFTED_TO_BASE).map(([shifted, base]) => [base, shifted]),
);

export function baseOf(shifted: string): string | undefined {
  return SHIFTED_TO_BASE[shifted];
}

/** @doc docs/specs/ui.md#keycode-labels */
export function shiftedOf(base: string): string | undefined {
  return BASE_TO_SHIFTED[base];
}
