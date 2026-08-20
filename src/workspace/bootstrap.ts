/**
 * workspace の新規作成と、旧 digest 規則で作られた binding の移行。
 *
 * definition の content-addressing は canonical 表現の SHA-256 で行う
 * （`canonicalDefinitionText`）。この規則を決める前に作られた workspace は
 * ファイルの bytes をそのまま digest しているため、`readDefinitionBinding` が
 * digest 不一致で落ちて開けなくなる。ここはその2つの入口を用意する。
 *
 * 書き込みは行わず plan を返す。実際の write は adapter 側が行う。
 */

import { canonicalDefinitionText } from "../core/definition/identity.ts";
import { parseDefinition } from "../core/definition/parse.ts";
import { serializeKeymapYaml } from "../core/keymap-yaml/serialize.ts";
import type { DefinitionBinding } from "../core/keymap-yaml/types.ts";
import type { VilDocument } from "../core/vil/types.ts";
import {
  definitionDigest,
  definitionPath,
  sha256Hex,
  WORKSPACE_LAYOUT,
  type Sha256Provider,
} from "./layout.ts";
import type { WorkspaceFileStore } from "./types.ts";

/** workspace を成立させるために書くファイル。 */
export interface WorkspacePlan {
  readonly definitionPath: string;
  readonly definitionDigest: string;
  /** canonical 表現。実機 read と CLI import が置く bytes を揃える。 */
  readonly definitionText: string;
  readonly keymapText: string;
}

/**
 * 実機 read の結果から workspace を新規に組み立てる。
 *
 * @doc docs/specs/ui.md#workspace初期化
 */
export async function planWorkspaceInit(
  document: VilDocument,
  rawDefinitionText: string,
  provider: Sha256Provider,
): Promise<WorkspacePlan> {
  const definitionText = canonicalDefinitionText(rawDefinitionText);
  const digest = await definitionDigest(definitionText, provider);
  const path = definitionPath(digest);
  return {
    definitionPath: path,
    definitionDigest: digest,
    definitionText,
    keymapText: serializeKeymapYaml(document, {
      keyboardUid: document.uid,
      keyboardName: parseDefinition(definitionText).name,
      definitionPath: path,
      definitionDigest: digest,
    }),
  };
}

/** 旧規則の binding を新しい digest 規則へ移す計画。 */
export interface BindingMigration extends WorkspacePlan {
  readonly previousPath: string;
  readonly previousDigest: string;
}

/**
 * 旧規則（ファイルの bytes をそのまま SHA-256）で作られた binding を検出する。
 *
 * **bytes の digest が binding と一致することが、definition が記録された当時と
 * 同じ内容である証明になる。** したがって digest を canonical 規則で計算し直しても
 * 別の definition を掴む余地が無く、実機も `.vil` も要らずに移行できる。
 * 一致しない場合は `undefined` を返して移行しない。digest 不一致を
 * 「keymap と definition の組の食い違い」の検出手段として残すため（ADR 0007）。
 *
 * @doc docs/specs/ui.md#旧bindingの移行
 */
export async function planBindingMigration(
  store: Pick<WorkspaceFileStore, "readBytes">,
  document: VilDocument,
  binding: DefinitionBinding,
  provider: Sha256Provider,
): Promise<BindingMigration | undefined> {
  const bytes = await store.readBytes(binding.definitionPath);
  if (bytes === undefined) return undefined;
  if ((await sha256Hex(bytes, provider)) !== binding.definitionDigest) return undefined;

  let definitionText: string;
  try {
    definitionText = canonicalDefinitionText(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
  const digest = await definitionDigest(definitionText, provider);
  // 既に canonical と一致しているなら旧規則ではない。移行するものが無い。
  if (digest === binding.definitionDigest) return undefined;

  const path = definitionPath(digest);
  return {
    previousPath: binding.definitionPath,
    previousDigest: binding.definitionDigest,
    definitionPath: path,
    definitionDigest: digest,
    definitionText,
    keymapText: serializeKeymapYaml(document, {
      ...binding,
      definitionPath: path,
      definitionDigest: digest,
    }),
  };
}

/**
 * plan を workspace へ書く。
 *
 * **definition を先に書く。** 間で中断しても `keymap.yaml` が存在しない状態
 * （＝新規作成をやり直せる状態）に留まり、「binding が指す先が無い」状態を作らない。
 *
 * @doc docs/specs/ui.md#workspace初期化
 */
export async function writeWorkspacePlan(
  store: Pick<WorkspaceFileStore, "writeText">,
  plan: WorkspacePlan,
): Promise<void> {
  await store.writeText(plan.definitionPath, plan.definitionText);
  await store.writeText(WORKSPACE_LAYOUT.keymap, plan.keymapText);
}
