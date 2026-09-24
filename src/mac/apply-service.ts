/**
 * `karabiner.json` への適用を filesystem と `karabiner_cli` 越しに行う Node の手順。
 *
 * CLI（`cornix mac apply`）とローカルサーバーの適用 API（ADR 0034）が同じ手順を通る。
 * 計画の組み立ては純関数の `planMacApply` が持ち、ここは read / 生成 / lint / backup /
 * write / verify / profile 選択の順序だけを持つ。
 */

import { join } from "node:path";
import {
  planMacApply,
  verifyMacApply,
  type MacApplyPlan,
  type MacVerifyResult,
} from "../core/mac-keymap/apply.ts";
import { generateKarabinerAsset } from "../core/mac-keymap/generate.ts";
import type { MacKeyboardLayout, MacKeymapDocument } from "../core/mac-keymap/types.ts";
import {
  readKarabinerConfig,
  writeFileAtomic,
  type KarabinerCli,
  type KarabinerCliResult,
} from "../karabiner/node.ts";
import { backupPath, generatedPath } from "../workspace/layout.ts";
import { NodeWorkspaceStore } from "../workspace/node.ts";

/** 適用の対象。どの workspace のどの配列の設定を、どの `karabiner.json` へ書くか。 */
export interface MacApplyTarget {
  readonly root: string;
  readonly layout: MacKeyboardLayout;
  /** workspace からの相対 path。 */
  readonly path: string;
  readonly document: MacKeymapDocument;
  readonly karabiner: string;
  readonly cli: KarabinerCli;
  readonly selectProfile: boolean;
}

/** 計画フェーズの結果。`invalid` は error があり、asset を生成していない。 */
export type MacApplyPlanning =
  | { readonly kind: "invalid"; readonly plan: MacApplyPlan }
  | {
      readonly kind: "planned";
      readonly plan: MacApplyPlan;
      readonly generated: string;
      /** Karabiner が入っていなければ `undefined`。 */
      readonly lint: KarabinerCliResult | undefined;
      /** 読んだ `karabiner.json` のテキスト。backup はこれをそのまま置く。 */
      readonly text: string;
    };

/** profile 選択の結果。選べたことを読み戻して確かめる。 */
export interface MacProfileSelected {
  readonly requested: string;
  readonly observed: string | null;
  readonly ok: boolean;
  readonly output: string;
}

/** 書き込みまで終えた結果。 */
export interface MacApplied {
  readonly backup: string;
  readonly verify: MacVerifyResult;
  /** 選択が不要、または Karabiner が入っていなければ `null`。 */
  readonly selected: MacProfileSelected | null;
}

/**
 * `karabiner.json` を読んで計画を組み、error が無ければ asset を生成して lint する。
 *
 * `karabiner.json` へは書かない。**lint は書き込み前のゲート**で、`applyMacPlan` の前に
 * 呼び出し側が結果を見る（ADR 0028）。error のある desired state は生成の手前で返すので、
 * `cornix/` は作られない。
 *
 * @doc docs/specs/mac-keymap.md#適用の境界
 */
export async function planMacApplyAt(target: MacApplyTarget): Promise<MacApplyPlanning> {
  const { config, text } = await readKarabinerConfig(target.karabiner);
  const plan = planMacApply(config, target.document, { selectProfile: target.selectProfile });
  if (plan.validation.summary.error > 0) return { kind: "invalid", plan };
  const asset = await writeAndLintAsset(
    target.root,
    target.document,
    generatedPath("karabiner-complex-modifications.json"),
    target.cli,
  );
  return { kind: "planned", plan, generated: asset.output, lint: asset.lint, text };
}

/**
 * backup → atomic 置換 → 読み直して verify → profile 選択、の順で適用する。
 *
 * fingerprint の照合と lint の判定は呼び出し側が先に済ませる。
 *
 * 順序に意味がある。`--select-profile` は Karabiner 自身に `karabiner.json` を書かせるので、
 * **verify の読み直しより後**でなければ、verify が自分で動かした後のファイルを見る（ADR 0028）。
 *
 * @doc docs/specs/mac-keymap.md#適用の境界
 */
export async function applyMacPlan(
  target: MacApplyTarget,
  planning: Extract<MacApplyPlanning, { kind: "planned" }>,
): Promise<MacApplied> {
  const { plan } = planning;
  // backup は読んだテキストをそのまま置く。再 serialize すると Karabiner 独自の整形が落ちる。
  const backup = backupPath(new Date(), { prefix: "karabiner-", extension: "json" });
  await new NodeWorkspaceStore(target.root).writeText(backup, planning.text);
  await writeFileAtomic(target.karabiner, `${JSON.stringify(plan.next, null, 4)}\n`);

  const { config: observed } = await readKarabinerConfig(target.karabiner);
  const verify = verifyMacApply(observed, plan.profile);
  const selected =
    verify.ok && target.selectProfile && plan.selection.required
      ? await selectOwnedProfile(target.cli, plan.selection.profile)
      : null;
  return { backup, verify, selected };
}

/**
 * 所有 profile を選び、選べたことを読み戻して確かめる。
 *
 * `selected` を `karabiner.json` へ書くのではなく `karabiner_cli` に選ばせる。動いている
 * Karabiner と食い違わないのはこちらだけで、Cornix が書く範囲は所有 profile 1 個のまま
 * 変わらない（ADR 0028）。Karabiner が入っていなければ `null` を返す。
 *
 * @doc docs/specs/mac-keymap.md#適用の境界
 */
export async function selectOwnedProfile(
  cli: KarabinerCli,
  profile: string,
): Promise<MacProfileSelected | null> {
  const result = await cli.selectProfile(profile);
  if (result === undefined) return null;
  const observed = await cli.currentProfileName();
  return {
    requested: profile,
    observed: observed ?? null,
    ok: result.ok && observed === profile,
    output: result.output,
  };
}

/**
 * complex_modifications の asset を書き出して lint する。
 *
 * Karabiner が入っていない環境では lint が `undefined` になり、判定は呼び出し側に委ねる。
 *
 * @doc docs/specs/mac-keymap.md#適用の境界
 */
export async function writeAndLintAsset(
  root: string,
  document: MacKeymapDocument,
  output: string,
  cli: KarabinerCli,
): Promise<{ readonly output: string; readonly lint: KarabinerCliResult | undefined }> {
  const { asset } = generateKarabinerAsset(document);
  await new NodeWorkspaceStore(root).writeText(output, `${JSON.stringify(asset, null, 2)}\n`);
  return { output, lint: await cli.lintComplexModifications(join(root, output)) };
}
