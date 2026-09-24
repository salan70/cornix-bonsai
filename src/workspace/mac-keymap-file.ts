/**
 * workspace から物理配列ごとの Mac 設定を読む。
 *
 * 設定の単位は物理配列で（ADR 0026）、配列の違う Mac を 1 つの workspace で扱うため
 * ファイルを分ける（ADR 0027）。ADR 0027 より前の `mac-keyboard.yaml` は、中の `layout`
 * 宣言がその配列を指していれば同じものとして読む。
 *
 * `src/core/mac-keymap/` は filesystem に触らないので、名前の解決はここが持つ。
 */

import { parseMacKeymapYaml } from "../core/mac-keymap/parse.ts";
import { serializeMacKeymapYaml } from "../core/mac-keymap/serialize.ts";
import type { MacKeyboardLayout, MacKeymapDocument } from "../core/mac-keymap/types.ts";
import { macKeymapPath, sha256Hex, WORKSPACE_LAYOUT, type Sha256Provider } from "./layout.ts";
import type { WorkspaceFileStore } from "./types.ts";

/** 読めた設定 1 件。`path` は保存先の解決にも使う。 */
export interface MacKeymapFile {
  readonly path: string;
  readonly document: MacKeymapDocument;
  /** 旧名（`mac-keyboard.yaml`）から読んだ場合に `true`。 */
  readonly legacy: boolean;
}

/**
 * 指定した配列の設定を読む。無ければ `undefined`。
 *
 * 新しい名前を先に見て、無ければ旧名を `layout` 宣言で解決する。新しい名前の中身が
 * ファイル名と違う配列を宣言していたら落とす。正規形が 2 つあると、どちらが正か
 * 分からないまま生成まで進んでしまう。
 *
 * @doc docs/specs/workspace-cli.md#readmackeymapfor
 */
export async function readMacKeymapFor(
  store: Pick<WorkspaceFileStore, "readText">,
  layout: MacKeyboardLayout,
): Promise<MacKeymapFile | undefined> {
  const path = macKeymapPath(layout);
  const text = await store.readText(path);
  if (text !== undefined) {
    const document = parseMacKeymapYaml(text);
    if (document.layout !== layout) {
      throw new Error(`${path} の layout 宣言が ${document.layout} でファイル名と一致しない`);
    }
    return { path, document, legacy: false };
  }

  const legacyPath = WORKSPACE_LAYOUT.legacyMacKeymap;
  const legacyText = await store.readText(legacyPath);
  if (legacyText === undefined) return undefined;
  const document = parseMacKeymapYaml(legacyText);
  if (document.layout !== layout) return undefined;
  return { path: legacyPath, document, legacy: true };
}

/**
 * 設定の同一性を表す digest。正規形へ serialize してから SHA-256 を取る。
 *
 * Web UI が編集中の内容と、ローカルサーバーがディスクから読んだ内容を突き合わせるために
 * 使う（ADR 0034）。ファイルのテキストではなく正規形を比べるので、手で書いたコメントや
 * 並び順の違いは同じ設定として扱う。
 *
 * @doc docs/specs/workspace-cli.md#mackeymapdigest
 */
export async function macKeymapDigest(
  document: MacKeymapDocument,
  provider: Sha256Provider,
): Promise<string> {
  return await sha256Hex(new TextEncoder().encode(serializeMacKeymapYaml(document)), provider);
}
