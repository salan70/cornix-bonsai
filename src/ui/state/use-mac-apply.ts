import { useEffect, useRef, useState } from "react";
import type { MacKeyboardLayout, MacKeymapDocument } from "../../core/mac-keymap/types.ts";
import type {
  MacApiFailure,
  MacApplyResponse,
  MacPlanBlocked,
  MacPlanned,
} from "../../server/protocol.ts";
import { macKeymapDigest } from "../../workspace/mac-keymap-file.ts";
import type { MacMachine } from "../mac-apply-gate.ts";
import {
  applyMacRemote,
  fetchMacStatus,
  planMacApplyRemote,
  selectMacProfileRemote,
  type MacServerUnreachable,
} from "../mac-server.ts";

/** 計画を組めずに止まった理由。 */
export type MacApplyStopped = MacPlanBlocked | MacApiFailure | MacServerUnreachable;

/** 書き込みを試みた後の結果。`fingerprint-mismatch` は計画の見直しへ戻すので含めない。 */
export type MacApplyOutcome =
  | Exclude<MacApplyResponse, { kind: "fingerprint-mismatch" } | MacPlanBlocked | MacApiFailure>
  | MacApplyStopped;

/** 適用ダイアログの段階。 */
export type MacApplyView =
  | { readonly phase: "closed" }
  | { readonly phase: "planning" }
  | { readonly phase: "stopped"; readonly reason: MacApplyStopped }
  | { readonly phase: "review"; readonly plan: MacPlanned; readonly changed: boolean }
  | { readonly phase: "applying"; readonly plan: MacPlanned }
  | { readonly phase: "result"; readonly outcome: MacApplyOutcome; readonly retrying: boolean };

/**
 * `Karabiner へ適用…` の状態。ローカルサーバーへの問い合わせだけを持ち、ファイルには触れない。
 *
 * このマシンの配列は起動時に 1 回だけ訊く。内蔵配列は起動中に変わらない。
 *
 * @doc docs/specs/ui.md#mac-apply
 */
export function useMacApply() {
  const [machine, setMachine] = useState<MacMachine>({ kind: "unknown" });
  const [view, setView] = useState<MacApplyView>({ phase: "closed" });
  const target = useRef<
    { readonly layout: MacKeyboardLayout; readonly digest: string } | undefined
  >(undefined);

  useEffect(() => {
    let alive = true;
    void fetchMacStatus().then((status) => {
      if (!alive) return;
      setMachine(
        status.kind === "status"
          ? { kind: "known", layout: status.layout }
          : { kind: "unreachable" },
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  /** 計画を組んで差分を見せる。 */
  async function open(layout: MacKeyboardLayout, document: MacKeymapDocument): Promise<void> {
    setView({ phase: "planning" });
    const digest = await macKeymapDigest(document, globalThis.crypto);
    target.current = { layout, digest };
    const result = await planMacApplyRemote({ layout, digest });
    setView(
      result.kind === "planned"
        ? { phase: "review", plan: result, changed: false }
        : { phase: "stopped", reason: result },
    );
  }

  /** 見せた計画の fingerprint を送り返して適用する。 */
  async function apply(): Promise<void> {
    if (view.phase !== "review" || target.current === undefined) return;
    const { plan } = view;
    setView({ phase: "applying", plan });
    const result = await applyMacRemote({ ...target.current, fingerprint: plan.fingerprint });
    if (result.kind === "fingerprint-mismatch") {
      setView({ phase: "review", plan: result.plan, changed: true });
      return;
    }
    setView({ phase: "result", outcome: result, retrying: false });
  }

  /** profile の切り替えだけをやり直す。書き込みはしない。 */
  async function retrySelect(): Promise<void> {
    if (view.phase !== "result" || view.outcome.kind !== "select-failed") return;
    if (target.current === undefined) return;
    const failed = view.outcome;
    setView({ phase: "result", outcome: failed, retrying: true });
    const result = await selectMacProfileRemote(target.current.layout);
    if (result.kind === "selected" && result.ok) {
      setView({
        phase: "result",
        outcome: { kind: "applied", backup: failed.backup, selected: true },
        retrying: false,
      });
      return;
    }
    const output =
      result.kind === "selected"
        ? result.output
        : result.kind === "failed"
          ? result.message
          : result.kind;
    setView({ phase: "result", outcome: { ...failed, output }, retrying: false });
  }

  function close(): void {
    target.current = undefined;
    setView({ phase: "closed" });
  }

  return { machine, view, open, apply, retrySelect, close };
}
