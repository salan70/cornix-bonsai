import { useEffect, useRef } from "react";
import type { DiffEntry } from "../../core/diff/diff.ts";
import type { ApplyState, WriteOperation } from "../../core/apply/plan.ts";
import type { evaluateApplyGate } from "../../core/validation/gate.ts";
import { keycodeLabel, type WorkspaceLabels } from "../../workspace/labels.ts";

/** @doc docs/specs/ui.md#apply-modal-steps */
export function ApplyDialog({
  state,
  changed,
  gate,
  labels,
  acknowledged,
  backupRoundTrips,
  roundTrips,
  roundTripTotal,
  onAcknowledge,
  onCancel,
  onApply,
}: {
  readonly state: ApplyState | undefined;
  readonly changed: readonly DiffEntry[];
  readonly gate: ReturnType<typeof evaluateApplyGate> | undefined;
  readonly labels: WorkspaceLabels;
  readonly acknowledged: readonly string[];
  readonly backupRoundTrips: number;
  readonly roundTrips: number;
  readonly roundTripTotal: number;
  readonly onAcknowledge: (ids: readonly string[]) => void;
  readonly onCancel: () => void;
  readonly onApply: () => void;
}): React.JSX.Element {
  const semanticChanges = changed.filter((entry) => entry.change !== "notationOnly");
  const notationOnlyChanges = changed.filter((entry) => entry.change === "notationOnly");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isWriting = state?.phase === "writing";
  const isFinished = state?.phase === "completed" || state?.phase === "aborted";
  const verified = state?.phase === "writing" || state?.phase === "completed" ? state.verified : [];

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
          <div className="row success-row">
            <span aria-hidden="true">✓</span>
            <span>
              Apply 前の全 read を <span className="mono">cornix/backups/</span> に保存した
            </span>
            <div className="grow" />
            <span className="disc">往復 {backupRoundTrips} 回</span>
          </div>
          {isWriting || state?.phase === "completed" ? (
            <WriteProgress
              operations={state?.phase === "writing" ? state.plan.operations : verified}
              verifiedCount={verified.length}
              changed={changed}
              labels={labels}
              roundTrips={roundTrips}
              roundTripTotal={roundTripTotal}
            />
          ) : (
            <>
              <div className="row-heading">
                <h3>書き込む差分</h3>
                <span className="disc">{changed.length} 件</span>
              </div>
              <div className="diff-list">
                {semanticChanges.map((entry, index) => (
                  <DiffRow entry={entry} labels={labels} key={`${entry.subject.kind}-${index}`} />
                ))}
              </div>
              {notationOnlyChanges.length > 0 ? (
                <div className="collapsed">
                  › 挙動が変わらない表記の差が {notationOnlyChanges.length}{" "}
                  件。書き込み対象には含める
                </div>
              ) : null}
            </>
          )}
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
          {state?.phase === "completed" ? (
            <div className="banner result-banner">
              <span aria-hidden="true">ⓘ</span>
              <span>
                ここで確認しているのは<b>実機に反映されたこと</b>
                で、電源を切っても残ることまでは確認していない。残ることを確かめたい場合は、Apply
                後に電源を入れ直して読み直す。
              </span>
            </div>
          ) : null}
        </div>
        <div className="mfoot">
          <span className="disc">
            {isWriting
              ? "中断すると、途中までの状態は持ち越さずに全 read からやり直す。"
              : "書き込むのは差分だけ。1 件ごとに書いて同じ entry を読み直して確認する。"}
          </span>
          <div className="grow" />
          <button className="btn" onClick={onCancel}>
            {isWriting ? "中断" : isFinished ? "閉じる" : "キャンセル"}
          </button>
          <button
            className="btn primary"
            disabled={
              isWriting ||
              (!isFinished && (gate?.allowed !== true || state?.phase !== "awaitingConfirmation"))
            }
            onClick={isFinished ? onCancel : onApply}
          >
            {isWriting ? "完了" : isFinished ? "完了" : `${changed.length} 件を実機へ書き込む`}
          </button>
        </div>
      </section>
    </dialog>
  );
}

function WriteProgress({
  operations,
  verifiedCount,
  changed,
  labels,
  roundTrips,
  roundTripTotal,
}: {
  readonly operations: readonly WriteOperation[];
  readonly verifiedCount: number;
  readonly changed: readonly DiffEntry[];
  readonly labels: WorkspaceLabels;
  readonly roundTrips: number;
  readonly roundTripTotal: number;
}): React.JSX.Element {
  const percentage = roundTripTotal === 0 ? 0 : Math.min(100, (roundTrips / roundTripTotal) * 100);
  return (
    <>
      <div className="write-summary">
        <div className="row-heading">
          <b>
            {verifiedCount} / {operations.length} 件を書き込んで確認した
          </b>
          <div className="grow" />
          <span className="mono muted">
            往復 {roundTrips} / {roundTripTotal} 回
          </span>
        </div>
        <div className="track">
          <div style={{ width: `${percentage}%` }} />
        </div>
        <span className="disc">残り時間は表示しない。進み具合は実測の往復回数で示す。</span>
      </div>
      <div className="diff-list">
        {operations.map((operation, index) => {
          const done = index < verifiedCount;
          const active = index === verifiedCount && verifiedCount < operations.length;
          const description = operationDescription(operation, changed, labels);
          return (
            <div
              className={`row write-row ${active ? "active" : ""} ${!done && !active ? "pending" : ""}`}
              key={`${operation.target.kind}-${index}`}
            >
              <span className="write-icon" aria-hidden="true">
                {done ? "✓" : active ? "⟳" : ""}
              </span>
              <span className="diff-subject">{targetLabel(operation)}</span>
              <span>{description}</span>
              <div className="grow" />
              <span className="disc">
                {done
                  ? "書き込み → 再読み込みが一致"
                  : active
                    ? "書き込んだ値を読み直している"
                    : "待機中"}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function operationDescription(
  operation: WriteOperation,
  changed: readonly DiffEntry[],
  labels: WorkspaceLabels,
): string {
  const entry = changed.find((candidate) => subjectMatchesTarget(candidate.subject, operation));
  return entry === undefined
    ? operation.after.join(", ")
    : labeledBehavior(entry.subject, entry.after, entry.afterBehavior, labels);
}

function subjectMatchesTarget(subject: DiffEntry["subject"], operation: WriteOperation): boolean {
  const target = operation.target;
  if (target.kind === "key")
    return (
      subject.kind === "key" &&
      subject.layer === target.layer &&
      subject.row === target.row &&
      subject.col === target.col
    );
  if (target.kind === "encoder")
    return (
      subject.kind === "encoder" &&
      subject.layer === target.layer &&
      subject.index === target.index &&
      (target.direction === 0 ? subject.direction === "ccw" : subject.direction === "cw")
    );
  if (target.kind === "tapDance")
    return subject.kind === "tapDance" && subject.index === target.index;
  if (target.kind === "combo") return subject.kind === "combo" && subject.index === target.index;
  return subject.kind === "setting" && subject.qsid === target.qsid;
}

function targetLabel(operation: WriteOperation): string {
  const target = operation.target;
  switch (target.kind) {
    case "key":
      return `layer ${target.layer} / row ${target.row} col ${target.col}`;
    case "encoder":
      return `layer ${target.layer} / encoder ${target.index} / ${target.direction === 0 ? "左回し" : "右回し"}`;
    case "tapDance":
      return `Tap Dance ${target.index}`;
    case "combo":
      return `Combo ${target.index}`;
    case "setting":
      return `settings / qsid ${target.qsid}`;
  }
}

function ApplySteps({
  phase,
}: {
  readonly phase: ApplyState["phase"] | undefined;
}): React.JSX.Element {
  const current =
    phase === "awaitingConfirmation"
      ? 1
      : phase === "writing"
        ? 3
        : phase === "completed"
          ? 5
          : phase === "aborted"
            ? 3
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

function DiffRow({
  entry,
  labels,
}: {
  readonly entry: DiffEntry;
  readonly labels: WorkspaceLabels;
}): React.JSX.Element {
  const label = entry.change === "added" ? "追加" : entry.change === "removed" ? "削除" : "変更";
  const className = entry.change === "added" ? "add" : entry.change === "removed" ? "rm" : "chg";
  return (
    <div className="row">
      <span className={`tag ${className}`}>{label}</span>
      <span className="diff-subject">{subjectLabel(entry.subject)}</span>
      <span className="from">
        {labeledBehavior(entry.subject, entry.before, entry.beforeBehavior, labels)}
      </span>
      <span aria-hidden="true">→</span>
      <span className="to">
        {labeledBehavior(entry.subject, entry.after, entry.afterBehavior, labels)}
      </span>
    </div>
  );
}

function labeledBehavior(
  subject: DiffEntry["subject"],
  raw: string,
  behavior: string,
  labels: WorkspaceLabels,
): string {
  if (subject.kind !== "key" && subject.kind !== "encoder") return behavior;
  const name = raw === "" ? undefined : keycodeLabel(labels, raw);
  return name === undefined ? behavior : `${name}（${raw}） — ${behavior}`;
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
