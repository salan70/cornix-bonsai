import type { ApplyState } from "../core/apply/plan.ts";
import type { WriteTarget } from "../core/apply/targets.ts";
import type { KeyboardDefinition } from "../core/definition/types.ts";
import type { DiffEntry } from "../core/diff/diff.ts";
import { evaluateApplyGate, type ApplyGateWithEvidence } from "../core/validation/gate.ts";
import { createDiagnostic } from "../core/validation/types.ts";
import { validateApplyKeymap } from "../core/validation/validate.ts";
import type { VilDocument } from "../core/vil/types.ts";
import type { Capacities } from "../core/keycode/table.ts";

/** Apply gate の入力にする実機の読込結果。`ReadDeviceResult` の一部。 */
export interface DeviceReadForGate {
  readonly document: VilDocument;
  readonly keyboardUid: string;
  readonly capacities: Capacities;
  readonly supportedQsids: readonly number[];
}

/** workspace が指す definition。`keymap.yaml` の binding。 */
export interface DefinitionBindingForGate {
  readonly definitionPath: string;
  readonly definitionDigest: string;
}

/**
 * 差分 1 件を実機 write の単位へ写す。write できない差分（layer 外のキー、Macro など）は `undefined`。
 *
 * @doc docs/specs/ui.md#apply-modal-steps
 */
export function toWriteTarget(entry: DiffEntry): WriteTarget | undefined {
  const subject = entry.subject;
  switch (subject.kind) {
    case "key":
      return subject.layer < 0
        ? undefined
        : { kind: "key", layer: subject.layer, row: subject.row, col: subject.col };
    case "encoder":
      return {
        kind: "encoder",
        layer: subject.layer,
        index: subject.index,
        direction: subject.direction === "ccw" ? 0 : 1,
      };
    case "tapDance":
      return { kind: "tapDance", index: subject.index };
    case "combo":
      return { kind: "combo", index: subject.index };
    case "setting":
      return { kind: "setting", qsid: subject.qsid };
    default:
      return undefined;
  }
}

/**
 * 目標状態と実機の読込結果から Apply gate を作る。差分が 0 件なら gate は無い。
 *
 * validation の診断に、definition の不一致と write 未対応の差分を error として足す。
 * severity と Apply の可否を結ぶのは `evaluateApplyGate` だけで、UI はここで severity を変えない。
 *
 * @doc docs/specs/ui.md#apply-modal-steps
 */
export function buildApplyGate(input: {
  readonly document: VilDocument;
  readonly definition: KeyboardDefinition;
  readonly binding: DefinitionBindingForGate;
  readonly device: DeviceReadForGate;
  readonly deviceDefinitionDigest: string | undefined;
  readonly changed: readonly DiffEntry[];
  readonly acknowledged: readonly string[];
}): ApplyGateWithEvidence | undefined {
  const { document, definition, binding, device, deviceDefinitionDigest, changed } = input;
  if (changed.length === 0) return undefined;
  const targets = changed
    .map(toWriteTarget)
    .filter((target): target is WriteTarget => target !== undefined);
  const validation = validateApplyKeymap(
    document,
    definition,
    {
      keyboardUid: device.keyboardUid,
      capacities: device.capacities,
      supportedQsids: device.supportedQsids,
    },
    { path: binding.definitionPath, digest: binding.definitionDigest },
    targets,
  );
  const diagnostics = [...validation.evidence.diagnostics];
  if (deviceDefinitionDigest !== binding.definitionDigest) {
    diagnostics.push(
      createDiagnostic(
        "compatibility/definition-mismatch",
        "error",
        { kind: "document" },
        deviceDefinitionDigest === undefined
          ? "実機definitionのdigestを取得できていないためApplyできない"
          : `実機definitionがworkspace bindingと異なる（workspace=${binding.definitionDigest} device=${deviceDefinitionDigest}）`,
        { workspace: binding.definitionDigest, device: deviceDefinitionDigest ?? "missing" },
      ),
    );
  }
  const unsupported = changed.length - targets.length;
  if (unsupported > 0) {
    diagnostics.push(
      createDiagnostic(
        "apply/unsupported-change",
        "error",
        { kind: "document" },
        `実機write未対応の差分が${unsupported}件あるためApplyできない`,
        { count: unsupported },
      ),
    );
  }
  return evaluateApplyGate(
    { ...validation.evidence, diagnostics: Object.freeze(diagnostics) },
    input.acknowledged,
  );
}

/**
 * Apply を開始できない理由。開始できるときは `undefined`。
 *
 * 理由は画面にそのまま出すため、利用者が次に取る行動が分かる文にする。
 *
 * @doc docs/specs/ui.md#apply-modal-steps
 */
export function applyBlockedReason(input: {
  readonly cornixReady: boolean;
  readonly connected: boolean;
  readonly read: boolean;
  readonly changedCount: number;
  readonly fatalCount: number;
}): string | undefined {
  if (!input.cornixReady) return "keymap.yaml を読み込めていない";
  if (!input.connected) return "実機に接続していない";
  if (!input.read) return "この接続で実機を読み込んでいない";
  if (input.changedCount === 0) return "実機との差分が 0 件";
  if (input.fatalCount > 0) return `error が ${input.fatalCount} 件あるため Apply できない`;
  return undefined;
}

/** 書き込みの往復回数の総数。1 operation は write と verify の 2 往復。 */
export function applyRoundTripTotal(state: ApplyState | undefined): number {
  if (state?.phase === "writing") return state.plan.operations.length * 2;
  if (state?.phase === "completed") return state.verified.length * 2;
  return 0;
}

/** Apply の中断理由を利用者向けの文にする。 */
export function abortReasonLabel(
  reason: Extract<ApplyState, { phase: "aborted" }>["reason"],
): string {
  switch (reason) {
    case "verify-mismatch":
      return "書き込み後に読み直した値が一致しなかった";
    case "timeout":
      return "実機の応答が時間内に返らなかった";
    case "disconnected":
      return "実機が切断された";
    case "protocol-error":
      return "実機との通信で想定外の応答があった";
    case "user-cancelled":
      return "中断した";
    case "uid-mismatch":
      return "実機の UID が読込時と異なる";
  }
}
