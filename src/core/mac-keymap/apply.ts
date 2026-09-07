/**
 * `karabiner.json` への適用を組み立てる純関数。
 *
 * ADR 0008 の状態機械（`src/core/apply/plan.ts`）は**再利用しない**。あちらは実機への
 * 往復する write を扱い「部分的に書けた状態」からの復旧を型で表すが、こちらは
 * 1 ファイルの atomic 置換なのでその状態が原理的に生じない（ADR 0022）。
 *
 * **diff と verify は構造で行う**。`karabiner_cli --format-json` が独自整形で
 * ファイルを書き換えるため、テキスト比較では毎回「変更あり」になる（D-007 で実証済み）。
 * ここで比較するのは parse 済みの値で、object の key 順は正規化してから突き合わせる。
 *
 * filesystem には触らない。read / backup / write は adapter の責務。
 *
 */

import { createDiagnostic, summarize, type Diagnostic } from "../validation/types.ts";
import { generateCornixProfile } from "./generate.ts";
import type { KarabinerConfig, KarabinerManipulator, KarabinerProfile } from "./karabiner.ts";
import { validateMacKeymap, type MacValidationResult } from "./validate.ts";
import type { MacKeymapDocument } from "./types.ts";

/** manipulator 1 件の差分。位置は rule の description と `from` の `key_code` で指す。 */
export interface ManipulatorDiff {
  readonly rule: string;
  readonly keyCode: string;
  readonly change: "added" | "removed" | "changed";
  readonly before?: KarabinerManipulator;
  readonly after?: KarabinerManipulator;
}

/** 所有 profile の構造 diff。 */
export interface OwnedProfileDiff {
  /** 適用前に所有 profile が存在したか。無ければ末尾へ追加する。 */
  readonly present: boolean;
  readonly changed: boolean;
  readonly entries: readonly ManipulatorDiff[];
}

/** 適用計画。write は行わない。 */
export interface MacApplyPlan {
  readonly validation: MacValidationResult;
  /** validation に加えて、profile の選択状態など適用時にだけ分かることを含む。 */
  readonly diagnostics: readonly Diagnostic[];
  readonly diff: OwnedProfileDiff;
  readonly profile: KarabinerProfile;
  /** 置き換え後の config 全体。`global` と他 profile と `selected` はそのまま。 */
  readonly next: KarabinerConfig;
  /** 人間の確認と適用を結びつける同一性の指紋。表示用ではない。 */
  readonly fingerprint: string;
}

/** verify の結果。所有 profile が期待と構造として一致するか。 */
export interface MacVerifyResult {
  readonly ok: boolean;
  readonly entries: readonly ManipulatorDiff[];
}

/**
 * `karabiner.json` の内容と desired state から適用計画を組む。
 *
 * @doc docs/specs/mac-keymap.md#planmacapply
 */
export function planMacApply(current: KarabinerConfig, document: MacKeymapDocument): MacApplyPlan {
  const validation = validateMacKeymap(document);
  const { profile } = generateCornixProfile(document);
  const before = ownedProfile(current, document.profile);
  const diff = diffOwnedProfile(before, profile);

  const diagnostics = [...validation.diagnostics];
  if (before !== undefined && before.selected !== true) {
    // profile の切り替えはユーザーの操作。selected は書き換えない（ADR 0022）。
    diagnostics.push(
      createDiagnostic(
        "mac-keymap/profile-not-selected",
        "warning",
        { kind: "field", name: document.profile },
        `profile ${document.profile} は選択されていない。karabiner_cli --select-profile で切り替える`,
        { profile: document.profile },
      ),
    );
  }

  return {
    validation,
    diagnostics,
    diff,
    profile,
    next: replaceOwnedProfile(current, profile),
    fingerprint: fingerprint(profile, diagnostics),
  };
}

/**
 * 適用後に読み直した config が期待どおりかを構造で確かめる。
 *
 * @doc docs/specs/mac-keymap.md#verifymacapply
 */
export function verifyMacApply(
  observed: KarabinerConfig,
  expected: KarabinerProfile,
): MacVerifyResult {
  const diff = diffOwnedProfile(ownedProfile(observed, expected.name), expected);
  return { ok: diff.present && !diff.changed, entries: diff.entries };
}

/**
 * 所有 profile の manipulator を構造で突き合わせる。
 *
 * @doc docs/specs/mac-keymap.md#diffownedprofile
 */
export function diffOwnedProfile(
  before: KarabinerProfile | undefined,
  after: KarabinerProfile,
): OwnedProfileDiff {
  const beforeEntries = indexManipulators(before);
  const afterEntries = indexManipulators(after);
  const keys = [...new Set([...beforeEntries.keys(), ...afterEntries.keys()])].sort();
  const entries: ManipulatorDiff[] = [];

  for (const key of keys) {
    const one = beforeEntries.get(key);
    const other = afterEntries.get(key);
    if (one !== undefined && other !== undefined) {
      if (canonical(one.manipulator) === canonical(other.manipulator)) continue;
      entries.push({
        rule: other.rule,
        keyCode: other.keyCode,
        change: "changed",
        before: one.manipulator,
        after: other.manipulator,
      });
      continue;
    }
    if (other !== undefined) {
      entries.push({
        rule: other.rule,
        keyCode: other.keyCode,
        change: "added",
        after: other.manipulator,
      });
      continue;
    }
    if (one !== undefined) {
      entries.push({
        rule: one.rule,
        keyCode: one.keyCode,
        change: "removed",
        before: one.manipulator,
      });
    }
  }

  return { present: before !== undefined, changed: entries.length > 0, entries };
}

/** `profiles[]` から所有 profile を探す。名前が一致する最初の 1 個だけ。 */
export function ownedProfile(config: KarabinerConfig, name: string): KarabinerProfile | undefined {
  return config.profiles.find((profile) => profile.name === name);
}

/**
 * 所有 profile だけを差し替えた config を返す。
 *
 * `global` と他の profile には触らない。所有 profile が持っていた `selected` などの
 * field は残す。生成する profile は `selected` を持たないため、丸ごと置き換えると
 * 選択状態を落としてしまう（ADR 0022）。
 */
function replaceOwnedProfile(config: KarabinerConfig, profile: KarabinerProfile): KarabinerConfig {
  let replaced = false;
  const profiles = config.profiles.map((existing) => {
    if (existing.name !== profile.name || replaced) return existing;
    replaced = true;
    return { ...existing, ...profile };
  });
  return { ...config, profiles: replaced ? profiles : [...profiles, profile] };
}

interface IndexedManipulator {
  readonly rule: string;
  readonly keyCode: string;
  readonly manipulator: KarabinerManipulator;
}

/** rule の description・`from` の `key_code`・同じキーの中の順番で manipulator を並べる。 */
function indexManipulators(
  profile: KarabinerProfile | undefined,
): ReadonlyMap<string, IndexedManipulator> {
  const indexed = new Map<string, IndexedManipulator>();
  if (profile === undefined) return indexed;
  for (const rule of profile.complex_modifications.rules) {
    const seen = new Map<string, number>();
    for (const manipulator of rule.manipulators) {
      const keyCode = manipulator.from.key_code;
      const ordinal = seen.get(keyCode) ?? 0;
      seen.set(keyCode, ordinal + 1);
      indexed.set(`${rule.description} ${keyCode} ${ordinal}`, {
        rule: rule.description,
        keyCode,
        manipulator,
      });
    }
  }
  return indexed;
}

/** object の key 順を正規化した表現。**ファイルのテキストとは比較しない**（ADR 0022）。 */
function canonical(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, normalize(record[key])]),
  );
}

/** 計画の全入力を順序を固定して表現する。表示用ではなく同一性確認用。 */
function fingerprint(profile: KarabinerProfile, diagnostics: readonly Diagnostic[]): string {
  const source = JSON.stringify([
    "mac-apply-plan-v1",
    normalize(profile),
    diagnostics.map((diagnostic) => diagnostic.id),
    summarize(diagnostics),
  ]);

  let first = 0x811c9dc5;
  let second = 5381;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = (Math.imul(second, 33) ^ code) >>> 0;
  }
  return `v1-${first.toString(16).padStart(8, "0")}-${second.toString(16).padStart(8, "0")}`;
}
