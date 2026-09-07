/**
 * desired state → `mac-keyboard.yaml` テキスト。
 *
 * `keymap.yaml` の serializer は物理配列の格子を diff へ残すために row を flow sequence で
 * 並べるが（ADR 0009）、こちらは疎な map なので格子が無い。並べ方は
 * `cornix/labels.yaml`（`src/workspace/labels.ts`）と同じく、section 見出しの下へ
 * `key: "value"` を 1 行ずつ置く形にする。
 *
 * 並び順は layer 昇順・`key_code` 名昇順で固定する。生成器の manipulator の順序と
 * 同じ規則にして、手で並べ替えても diff が動かないようにする。
 *
 */

import { MAC_KEYMAP_SCHEMA, type MacKeymapDocument } from "./types.ts";

/** @doc docs/specs/mac-keymap.md#serializemackeymapyaml */
export function serializeMacKeymapYaml(document: MacKeymapDocument): string {
  const lines = [`schema: ${MAC_KEYMAP_SCHEMA}`, `profile: ${quote(document.profile)}`, "layers:"];
  for (const [layer, assignments] of [...document.layers.entries()].sort(([a], [b]) => a - b)) {
    lines.push(`  ${layer}:`);
    for (const [keyCode, keycode] of [...assignments.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      lines.push(`    ${quote(keyCode)}: ${quote(keycode)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function quote(value: string): string {
  return JSON.stringify(value);
}
