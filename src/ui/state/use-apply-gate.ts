import { useMemo } from "react";
import { diffDocuments, type DiffEntry } from "../../core/diff/diff.ts";
import type { ApplyGateWithEvidence } from "../../core/validation/gate.ts";
import type { ReadDeviceResult } from "../../device/webhid.ts";
import { CORNIX_LP_V112_SETTINGS } from "../../workspace/settings.ts";
import { buildApplyGate } from "../apply-gate.ts";
import type { WorkspaceModel } from "../workspace-probe.ts";

type CornixReady = Extract<WorkspaceModel["cornix"], { kind: "ready" }>;

/**
 * 実機の現在状態と目標状態の差分と、それに対する Apply gate。
 *
 * 実機を読み込んでいなければ差分は 0 件で、gate は無い。
 *
 * @doc docs/specs/ui.md#状態の持ち方
 */
export function useApplyGate(input: {
  readonly cornix: CornixReady | undefined;
  readonly deviceRead: ReadDeviceResult | undefined;
  readonly deviceDefinitionDigest: string | undefined;
  readonly acknowledged: readonly string[];
}): {
  readonly changed: readonly DiffEntry[];
  readonly gate: ApplyGateWithEvidence | undefined;
} {
  const { cornix, deviceRead, deviceDefinitionDigest, acknowledged } = input;
  const changed = useMemo(() => {
    if (cornix === undefined || deviceRead === undefined) return [];
    return diffDocuments(deviceRead.document, cornix.document, cornix.definition, {
      settings: { labels: CORNIX_LP_V112_SETTINGS },
    }).entries;
  }, [cornix, deviceRead]);
  const gate = useMemo(
    () =>
      cornix === undefined || deviceRead === undefined
        ? undefined
        : buildApplyGate({
            document: cornix.document,
            definition: cornix.definition,
            binding: cornix.binding,
            device: deviceRead,
            deviceDefinitionDigest,
            changed,
            acknowledged,
          }),
    [acknowledged, changed, cornix, deviceDefinitionDigest, deviceRead],
  );
  return { changed, gate };
}
