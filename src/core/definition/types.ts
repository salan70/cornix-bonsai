/**
 * keyboard definition（`vial.json`）の型と、そこから導出する派生データの型。
 *
 * ADR 0002 のとおり definition は入力データであり、matrix 対応・encoder 数・
 * custom keycode の意味はすべてここから導出する。Cornix LP の配列を hard-code しない。
 */

/** definition が宣言する custom keycode。定義順がそのまま `USER00`, `USER01`, … になる。 */
export interface CustomKeycodeDefinition {
  readonly name: string;
  readonly title: string;
  readonly shortName: string;
}

/** `vial.json` のうち Cornix Bonsai が解釈する範囲。 */
export interface KeyboardDefinition {
  readonly name: string;
  readonly vendorId: string;
  readonly productId: string;
  readonly matrix: { readonly rows: number; readonly cols: number };
  readonly customKeycodes: readonly CustomKeycodeDefinition[];
  readonly layouts: {
    /** layout 選択肢の名前。**存在しても選択肢がある証拠にはならない**（ADR 0002）。 */
    readonly labels?: readonly unknown[];
    /** KLE 形式の物理配列。 */
    readonly keymap: readonly unknown[];
  };
}

/**
 * definition の KLE から導出した物理キー 1 個。
 *
 * rendering 専用の派生データであり、`.vil` の round-trip 対象ではない（ADR 0002）。
 */
export interface PhysicalKey {
  readonly row: number;
  readonly col: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationAngle: number;
  readonly rotationX: number;
  readonly rotationY: number;
  /** layout 選択肢の `[option, choice]`。選択肢に属さないキーは `undefined`。 */
  readonly layoutOption?: readonly [number, number];
}

/** definition の KLE から導出した encoder 1 方向。direction 0 = 反時計回り（ADR 0003）。 */
export interface PhysicalEncoder {
  readonly index: number;
  readonly direction: number;
  readonly x: number;
  readonly y: number;
}

/** definition から導出した物理配列。rendering 専用。 */
export interface PhysicalLayout {
  readonly keys: readonly PhysicalKey[];
  readonly encoders: readonly PhysicalEncoder[];
}
