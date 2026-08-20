import { useEffect, useRef } from "react";
import type { DiffEntry } from "../../core/diff/diff.ts";
import type { ApplyState } from "../../core/apply/plan.ts";
import type { evaluateApplyGate } from "../../core/validation/gate.ts";

export function ApplyDialog({
  state,
  changed,
  gate,
  acknowledged,
  onAcknowledge,
  onCancel,
  onApply,
}: {
  readonly state: ApplyState | undefined;
  readonly changed: readonly DiffEntry[];
  readonly gate: ReturnType<typeof evaluateApplyGate> | undefined;
  readonly acknowledged: readonly string[];
  readonly onAcknowledge: (ids: readonly string[]) => void;
  readonly onCancel: () => void;
  readonly onApply: () => void;
}): React.JSX.Element {
  const semanticChanges = changed.filter((entry) => entry.change !== "notationOnly");
  const notationOnlyChanges = changed.filter((entry) => entry.change === "notationOnly");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal-backdrop"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <section className="modal" aria-labelledby="apply-title">
        <div className="mhdr">
          <h2 id="apply-title">実機へ Apply</h2>
          <div className="grow" />
          <ApplySteps phase={state?.phase} />
        </div>
        <div className="mbody">
          <div
            className="row"
            style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
          >
            <span aria-hidden="true">✓</span>
            <span>
              Apply 前の全 read を <span className="mono">cornix/backups/</span> に保存した
            </span>
            <div className="grow" />
            <span className="disc">backup 完了</span>
          </div>
          <div className="row-heading">
            <h3>書き込む差分</h3>
            <span className="disc">{changed.length} 件</span>
          </div>
          <div className="diff-list">
            {semanticChanges.map((entry, index) => (
              <DiffRow entry={entry} key={`${entry.subject.kind}-${index}`} />
            ))}
          </div>
          {notationOnlyChanges.length > 0 ? (
            <div className="collapsed">
              › 挙動が変わらない表記の差が {notationOnlyChanges.length} 件。書き込み対象には含める
            </div>
          ) : null}
          {gate !== undefined && gate.acknowledgeable.length > 0 ? (
            <section className="banner">
              <span aria-hidden="true">⚠</span>
              <div className="ack-body">
                <b>警告 {gate.acknowledgeable.length} 件を確認しないと Apply できない</b>
                {gate.acknowledgeable.map((diagnostic) => (
                  <label className="ack" key={diagnostic.id}>
                    <input
                      type="checkbox"
                      checked={acknowledged.includes(diagnostic.id)}
                      disabled={state?.phase === "writing"}
                      onChange={(event) =>
                        onAcknowledge(
                          event.target.checked
                            ? [...acknowledged, diagnostic.id]
                            : acknowledged.filter((id) => id !== diagnostic.id),
                        )
                      }
                    />
                    <span>
                      {diagnostic.message}
                      <br />
                      <span className="mono muted">{diagnostic.code}</span>
                    </span>
                  </label>
                ))}
                <span className="disc">
                  acknowledge は根拠の値ごとに記録する。差分が変わると自動で外れる。
                </span>
              </div>
            </section>
          ) : null}
          {gate !== undefined && gate.fatal.length > 0 ? (
            <section className="banner error-banner">
              <b>error があるため Apply できません。</b>
              <ul>
                {gate.fatal.map((diagnostic) => (
                  <li key={diagnostic.id}>{diagnostic.message}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {state?.phase === "aborted" ? (
            <p className="error">{state.reason}。再接続後にfull readからやり直してください。</p>
          ) : null}
        </div>
        <div className="mfoot">
          <span className="disc">
            {state?.phase === "writing"
              ? "中断すると、途中までの状態は持ち越さずに全 read からやり直す。"
              : "書き込むのは差分だけ。1 件ごとに書いて同じ entry を読み直して確認する。"}
          </span>
          <div className="grow" />
          <button className="btn" onClick={onCancel}>
            {state?.phase === "writing" ? "中断" : "キャンセル"}
          </button>
          <button
            className="btn primary"
            disabled={gate?.allowed !== true || state?.phase !== "awaitingConfirmation"}
            onClick={onApply}
          >
            {changed.length} 件を実機へ書き込む
          </button>
        </div>
      </section>
    </dialog>
  );
}

function ApplySteps({
  phase,
}: {
  readonly phase: ApplyState["phase"] | undefined;
}): React.JSX.Element {
  const current =
    phase === "awaitingConfirmation"
      ? 2
      : phase === "writing"
        ? 3
        : phase === "completed" || phase === "aborted"
          ? 4
          : 1;
  const steps = ["backup", "差分確認", "確認", "書き込み", "結果"];
  return (
    <div className="steps" aria-label="Apply steps">
      {steps.map((step, index) => (
        <span className="step-wrap" key={step}>
          {index > 0 ? <span className="bar" /> : null}
          <span className={`st ${index < current ? "done" : ""} ${index === current ? "now" : ""}`}>
            {index < current ? "✓ " : ""}
            {step}
          </span>
        </span>
      ))}
    </div>
  );
}

function DiffRow({ entry }: { readonly entry: DiffEntry }): React.JSX.Element {
  const label = entry.change === "added" ? "追加" : entry.change === "removed" ? "削除" : "変更";
  const className = entry.change === "added" ? "add" : entry.change === "removed" ? "rm" : "chg";
  return (
    <div className="row">
      <span className={`tag ${className}`}>{label}</span>
      <span className="diff-subject">{subjectLabel(entry.subject)}</span>
      <span className="from">{entry.beforeBehavior}</span>
      <span aria-hidden="true">→</span>
      <span className="to">{entry.afterBehavior}</span>
    </div>
  );
}

function subjectLabel(subject: DiffEntry["subject"]): string {
  switch (subject.kind) {
    case "key":
      return `layer ${subject.layer} / row ${subject.row} col ${subject.col}`;
    case "encoder":
      return `layer ${subject.layer} / encoder ${subject.index} ${subject.direction === "ccw" ? "左回し" : "右回し"}`;
    case "setting":
      return `settings / qsid ${subject.qsid}`;
    case "tapDance":
      return `Tap Dance ${subject.index}`;
    case "combo":
      return `Combo ${subject.index}`;
    case "macro":
      return `Macro ${subject.index}`;
    case "document":
      return "document";
    case "layer":
      return `layer ${subject.layer}`;
    case "field":
      return subject.name;
  }
}
