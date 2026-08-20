/** Picker に置く 1 個の keycode。表示名は keycodeDisplay に委譲する。 */
export interface PickerKey {
  readonly keycode: string;
  /** 物理配列上の幅。省略時は 1u。 */
  readonly u?: number;
}

/** keycode を置かない物理的な空き。省略時は 1u。 */
export interface Spacer {
  readonly kind: "spacer";
  readonly u?: number;
}

export type PickerEntry = PickerKey | Spacer;

export interface PickerRow {
  readonly main: readonly PickerEntry[];
  readonly nav?: readonly PickerEntry[];
  readonly numpad?: readonly PickerEntry[];
}

function key(keycode: string, u = 1): PickerKey {
  return u === 1 ? { keycode } : { keycode, u };
}

function spacer(u = 1): Spacer {
  return u === 1 ? { kind: "spacer" } : { kind: "spacer", u };
}

const functionKeys = Array.from({ length: 12 }, (_, index) => key(`KC_F${index + 1}`));

/**
 * Vial の ISO/JIS 面に相当する keycode picker の物理配列。
 *
 * main は ISO/JIS の本体、nav と numpad は同じ行高で右側へ置く cluster である。
 * keycap のラベルはここへ複製せず、既存の keycodeDisplay を使う。
 */
export const ISO_JIS_ROWS: readonly PickerRow[] = [
  {
    main: [
      key("KC_ESCAPE"),
      spacer(),
      ...functionKeys.slice(0, 4),
      spacer(),
      ...functionKeys.slice(4, 8),
      spacer(),
      ...functionKeys.slice(8),
    ],
    nav: [key("KC_PSCREEN"), key("KC_SCROLLLOCK"), key("KC_PAUSE")],
    numpad: [key("KC_NUMLOCK"), key("KC_KP_SLASH"), key("KC_KP_ASTERISK"), key("KC_KP_MINUS")],
  },
  {
    main: [
      key("KC_INT3"),
      ...Array.from({ length: 9 }, (_, index) => key(`KC_${index + 1}`)),
      key("KC_0"),
      key("KC_MINUS"),
      key("KC_EQUAL"),
      key("KC_INT1"),
      key("KC_BSPACE", 2),
    ],
    nav: [key("KC_INSERT"), key("KC_HOME"), key("KC_PGUP")],
    numpad: [key("KC_KP_7"), key("KC_KP_8"), key("KC_KP_9"), key("KC_KP_PLUS", 2)],
  },
  {
    main: [
      key("KC_TAB", 1.5),
      ...["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"].map((letter) => key(`KC_${letter}`)),
      key("KC_LBRACKET"),
      key("KC_RBRACKET"),
      key("KC_NONUS_BSLASH", 1.5),
    ],
    nav: [key("KC_DELETE"), key("KC_END"), key("KC_PGDOWN")],
    numpad: [key("KC_KP_4"), key("KC_KP_5"), key("KC_KP_6"), key("KC_KP_ENTER", 2)],
  },
  {
    main: [
      key("KC_CAPSLOCK", 1.75),
      ...["A", "S", "D", "F", "G", "H", "J", "K", "L"].map((letter) => key(`KC_${letter}`)),
      key("KC_SCOLON"),
      key("KC_QUOTE"),
      key("KC_ENTER", 2.25),
    ],
    nav: [key("KC_LEFT"), key("KC_DOWN"), key("KC_UP"), key("KC_RIGHT")],
    numpad: [key("KC_KP_1"), key("KC_KP_2"), key("KC_KP_3")],
  },
  {
    main: [
      key("KC_LSHIFT", 2.25),
      key("KC_NONUS_HASH"),
      ...["Z", "X", "C", "V", "B", "N", "M"].map((letter) => key(`KC_${letter}`)),
      key("KC_COMMA"),
      key("KC_DOT"),
      key("KC_SLASH"),
      key("KC_RSHIFT", 2.75),
    ],
    numpad: [key("KC_KP_0", 2), key("KC_KP_DOT"), key("KC_KP_EQUAL"), key("KC_KP_COMMA")],
  },
  {
    main: [
      key("KC_LCTRL", 1.25),
      key("KC_LGUI", 1.25),
      key("KC_LALT", 1.25),
      key("KC_INT5", 1.25),
      key("KC_SPACE", 6.25),
      key("KC_INT4", 1.25),
      key("KC_INT2", 1.25),
      key("KC_RALT", 1.25),
      key("KC_RGUI", 1.25),
      key("KC_RCTRL", 1.25),
    ],
  },
  {
    main: [
      key("KC_LANG1"),
      key("KC_TILD"),
      key("KC_EXLM"),
      key("KC_AT"),
      key("KC_HASH"),
      key("KC_DLR"),
      key("KC_PERC"),
      key("KC_CIRC"),
      key("KC_AMPR"),
      key("KC_ASTR"),
      key("KC_LPRN"),
      key("KC_RPRN"),
      key("KC_UNDS"),
      key("KC_PLUS"),
      key("KC_LCBR"),
      key("KC_RCBR"),
      key("KC_PIPE"),
      key("KC_COLN"),
      key("KC_DQUO"),
      key("KC_LT"),
      key("KC_GT"),
      key("KC_QUES"),
      key("KC_LANG2"),
    ],
  },
];
