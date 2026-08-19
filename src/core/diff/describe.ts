/**
 * raw 表現と semantic 表現の**境界**。
 *
 * ADR 0010 の規則はひとつ。**判定は raw で行い、semantic は表示にしか使わない。**
 *
 *   - `USERnn` は `USERnn` のまま比較する。表示だけ definition の `title` を使う。
 *     同じ `USER01` が definition ごとに別の keycode を指すため（ADR 0002）、表示名で比較すると
 *     definition を差し替えたときに「変更なし」と誤判定する
 *   - `settings` は qsid → 数値のまま比較する。qsid から設定名への対応表は Vial 側にあり、
 *     実機が対応 qsid を申告する（ADR 0003）。Cornix Bonsai は**任意の表示辞書**として受け取り、
 *     辞書に無い qsid は `qsid 22` と raw のまま出す
 *   - alias（`KC_BSPC` と `KC_BSPACE`）は raw では別物だが挙動は同じ。
 *     `canonicalKeycode`（語彙表と同じ場所に置く）で「表記だけの差」に分類する。
 *     **alias 表は不完全でよい**。取りこぼしは「変更あり」側へ倒れるので、
 *     静かに差分を消すことはない
 */

import type { KeycodeTable } from "../keycode/table.ts";
import { classifyKeycode } from "../validation/keycode-vocabulary.ts";

/** qsid から設定名への任意の表示辞書。定義元は Vial 側で、Cornix Bonsai は持たない。 */
export interface SettingsVocabulary {
  readonly labels: ReadonlyMap<number, string>;
}

/** 辞書を渡さない場合の既定。すべて raw 表示になる。 */
export const EMPTY_SETTINGS_VOCABULARY: SettingsVocabulary = { labels: new Map() };

/**
 * settings 1 件を表示用の文字列にする。
 *
 * 辞書に無い qsid でも**必ず値を出す**。辞書の欠落で設定が画面から消えると、
 * ユーザーは変更に気づけない。
 *
 * @doc docs/specs/semantic-diff.md#describesetting
 */
export function describeSetting(
  qsid: number,
  value: number | undefined,
  vocabulary: SettingsVocabulary = EMPTY_SETTINGS_VOCABULARY,
): string {
  const label = vocabulary.labels.get(qsid) ?? `qsid ${qsid}`;
  return value === undefined ? `${label}: 未設定` : `${label}: ${value}`;
}

/**
 * keycode を「挙動」の日本語で説明する。
 *
 * semantic diff が raw keycode を並べずに済むのはこの関数のため。definition 依存の部分
 * （`USERnn`）だけ `KeycodeTable` に聞き、それ以外は語彙表で解く。
 *
 * @doc docs/specs/semantic-diff.md#describekeycode
 */
export function describeKeycode(keycode: string, table: KeycodeTable): string {
  const lexeme = classifyKeycode(keycode);

  switch (lexeme.kind) {
    case "none":
      return "何も起きない";
    case "transparent":
      return "下の layer の割り当てを透過する";
    case "basic":
      return lexeme.name;
    case "modified":
      return `${lexeme.modifier} + ${describeKeycode(lexeme.inner, table)}`;
    case "modTap":
      return `tap で ${describeKeycode(lexeme.inner, table)} / hold で ${lexeme.modifier}`;
    case "oneShotMod":
      return `次の 1 打鍵だけ ${lexeme.modifier}`;
    case "layerSwitch":
      return describeLayerSwitch(lexeme.action, lexeme.layer, lexeme.inner, table);
    case "tapDance":
      return `tap dance ${lexeme.index}`;
    case "macro":
      return `macro ${lexeme.index}`;
    case "custom": {
      const resolved = table.resolve(keycode);
      return resolved.kind === "custom"
        ? `${resolved.name}（${resolved.title}）`
        : `${keycode}（この definition では未定義）`;
    }
    case "numeric":
      return `数値 keycode ${keycode}`;
    case "unknown":
      return `解釈できない keycode ${keycode}`;
  }
}

function describeLayerSwitch(
  action: string,
  layer: number,
  inner: string | undefined,
  table: KeycodeTable,
): string {
  switch (action) {
    case "momentary":
      return `押している間だけ layer ${layer}`;
    case "layerTap":
      return `tap で ${inner === undefined ? "" : describeKeycode(inner, table)} / hold で layer ${layer}`;
    case "layerMod":
      return `押している間だけ layer ${layer} + ${inner ?? ""}`;
    case "toggle":
      return `layer ${layer} のオン / オフを切り替える`;
    case "to":
      return `layer ${layer} へ移り、そのまま留まる`;
    case "tapToggle":
      return `hold で layer ${layer}、連打で固定`;
    case "default":
      return `base layer を layer ${layer} にする`;
    case "oneShot":
      return `次の 1 打鍵だけ layer ${layer}`;
    default:
      return `layer ${layer} を操作する`;
  }
}
