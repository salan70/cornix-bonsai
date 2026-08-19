/**
 * 実機へ送るwrite commandの許可リスト。
 *
 * ADR 0005 の「送らないcommandを実装側に持たない」をそのまま型にした module。
 * **reset系のcommandをここに載せないことが、AI / CLIからのwrite境界の実体**である
 * （D-005）。上位に権限フラグを置いて分岐させる方式は採らない。分岐は消し忘れると
 * 効かなくなるが、command自体が存在しなければ呼びようがない。
 */

/** 差分writeに使う単一entry command。ADR 0005 が許可した5種類だけ。  *
 * @doc docs/specs/apply-flow.md#write-commands
 */
export const WRITE_COMMANDS = {
  /** keymap 1マス。VIA `0x05` DynamicKeymapSetKeycode */
  key: { id: 0x05, sub: undefined },
  /** encoder 1方向。Vial `0xFE 0x04` */
  encoder: { id: 0xfe, sub: 0x04 },
  /** tap dance 1件。Vial `0xFE 0x0D` sub `0x02` */
  tapDance: { id: 0xfe, sub: 0x0d },
  /** combo 1件。Vial `0xFE 0x0D` sub `0x04` */
  combo: { id: 0xfe, sub: 0x0d },
  /** settings 1件（qsid単位）。Vial `0xFE 0x0B` */
  setting: { id: 0xfe, sub: 0x0b },
} as const;

export type WriteCommandKind = keyof typeof WRITE_COMMANDS;

/**
 * 実装しないcommand。**参照用の記録であり、送信経路は持たない。**
 *
 * ここに名前を残すのは、将来「なぜ実装しないのか」を再調査させないため。
 * ADR 0005 の根拠は以下。
 *
 * - `0x13` DynamicKeymapSetBuffer: readと非対称（offsetの単位もendiannessも違う）。
 *   `try_send`のため`FLASH_CHANNEL`が埋まると黙って捨てられる。
 *   VIAの`size`をそのまま渡すとRMKが32 byteのreportを超えて読みpanicする
 * - `0x0F` DynamicKeymapSetMacroBuffer: buffer全体をflashへflushする。RMKの実装が途中
 * - `0x0A` EepromReset: firmware既定へ戻すだけでユーザーの元の状態には戻さない
 * - `0x0B` BootloaderJump: **unlockを確認せず即座にbootloaderへ飛ぶ**
 * - `0x06` DynamicKeymapReset / `0x15` DynamicKeymapSetEncoder: RMKでは`warn!`を出すだけ
 */
export const NOT_IMPLEMENTED_COMMANDS = [
  "0x13 DynamicKeymapSetBuffer",
  "0x0F DynamicKeymapSetMacroBuffer",
  "0x0A EepromReset",
  "0x0B BootloaderJump",
  "0x06 DynamicKeymapReset",
  "0x15 DynamicKeymapSetEncoder",
] as const;

/**
 * 1往復あたりのtimeout（ms）。
 *
 * ADR 0004 が初期値3000msを置き、確定はD-005へ送られていた。**3000msのまま確定する。**
 *
 * 実測（BLE）はread p50 30.0ms / max 512.4ms、write p50 45.0ms / p95 174.7ms。
 * 数値だけ見れば1000ms程度まで詰められるが、詰めない理由が2つある。
 *
 * - max 512.4msの由来が未確認（connection interval更新 / flash read / OSのscheduling）
 * - `sequential-storage`のGCが走るタイミングと、それがwrite latencyへ与える影響が未測定
 *
 * timeoutを詰めすぎると、正常なwriteをtimeoutと誤判定して中断する。中断はApply全体の
 * やり直し（全read + diff再計算）を要求するため、誤判定の代償が待ち時間より大きい。
 * 根拠が揃うまで余裕を残す。値はtransportで変えない（ADR 0004）。
 */
export const ROUND_TRIP_TIMEOUT_MS = 3000;
