import { useEffect, useRef } from "react";
import type { ApplyState, WriteOperation } from "../../core/apply/plan.ts";
import type { DiffEntry } from "../../core/diff/diff.ts";
import type { ApplyGateWithEvidence } from "../../core/validation/gate.ts";
import { keycodeLabel, type WorkspaceLabels } from "../../workspace/labels.ts";
import { WORKSPACE_LAYOUT } from "../../workspace/layout.ts";
import { abortReasonLabel } from "../apply-gate.ts";
import { SEVERITY_VIEW, subjectLabel } from "../diagnostics.ts";
import type { ApplyStep } from "../state/use-apply.ts";
import { Button } from "./Button.tsx";
import { Icon } from "./Icon.tsx";

const STEPS = ["backup", "差分確認", "確認", "書き込み", "結果"] as const;

const CHANGE_VIEW: Readonly<
  Record<DiffEntry["change"], { readonly label: string; readonly className: string }>
> = {
  added: { label: "追加", className: "tag tag-add" },
  changed: { label: "変更", className: "tag tag-change" },
  removed: { label: "削除", className: "tag tag-remove" },
  notationOnly: { label: "表記", className: "tag" },
};

/**
 * 実機への Apply。backup → 差分確認 → 確認 → 書き込み → 結果の線形の modal。
 *
 * 書き込みを始める前はキャンセルでき、始めた後は「中断」だけを出す。Esc は書き込み中は何もしない。
 * 完了は「実機に反映した」とだけ言い、電源を切った後に残るかは確かめていないと明示する。
 */
export function ApplyDialog({
  step,
  backupError,
  state,
  changed,
  gate,
  labels,
  acknowledged,
  backupRoundTrips,
  roundTrips,
  roundTripTotal,
  onNext,
  onAcknowledge,
  onCancel,
  onWrite,
}: {
  readonly step: ApplyStep;
  readonly backupError: string | undefined;
  readonly state: ApplyState | undefined;
  readonly changed: readonly DiffEntry[];
  readonly gate: ApplyGateWithEvidence | undefined;
  readonly labels: WorkspaceLabels;
  readonly acknowledged: readonly string[];
  readonly backupRoundTrips: number;
  readonly roundTrips: number;
  readonly roundTripTotal: number;
  readonly onNext: () => void;
  readonly onAcknowledge: (ids: readonly string[]) => void;
  readonly onCancel: () => void;
  readonly onWrite: () => void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const index =
    state?.phase === "writing"
      ? 3
      : state?.phase === "completed" || state?.phase === "aborted"
        ? 4
        : step === "backup"
          ? 0
          : step === "diff"
            ? 1
            : 2;
  const writing = state?.phase === "writing";
  const finished = index === 4;
  const semantic = changed.filter((entry) => entry.change !== "notationOnly");
  const notationOnly = changed.filter((entry) => entry.change === "notationOnly");
  const warnings =
    gate?.evidence.diagnostics.filter((diagnostic) => diagnostic.severity === "warning") ?? [];
  const fatal = gate?.fatal ?? [];
  const canWrite = gate?.allowed === true && state?.phase === "awaitingConfirmation";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  return (
    <dialog
      ref={dialogRef}
      className="apply"
      data-apply-dialog
      data-step={index}
      aria-labelledby="apply-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!writing) onCancel();
      }}
    >
      <header className="apply-head">
        <h2 id="apply-title" ref={headingRef} tabIndex={-1}>
          実機へ Apply
        </h2>
        <ol className="apply-steps" aria-label="Apply の段階">
          {STEPS.map((label, stepIndex) => (
            <li
              key={label}
              className={stepIndex < index ? "is-done" : stepIndex === index ? "is-current" : ""}
              aria-current={stepIndex === index ? "step" : undefined}
            >
              <span className="step-no">
                {stepIndex < index ? (
                  <>
                    <Icon name="check" />
                    {/* アイコンは読み上げから外すので、完了した段の番号は文字で添える。 */}
                    <span className="visually-hidden">{stepIndex + 1}（完了）</span>
                  </>
                ) : (
                  stepIndex + 1
                )}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </header>

      <div className="apply-body">
        {index >= 1 ? (
          <p className="backup-row">
            <strong>
              <Icon name="check" />
            </strong>
            <span>
              Apply 前の全 read（往復 {backupRoundTrips} 回）を <code>cornix/backups/</code> と{" "}
              <code>{WORKSPACE_LAYOUT.latestBackup}</code> に保存した
            </span>
          </p>
        ) : null}

        {index === 0 ? (
          <section role="status" aria-live="polite">
            <h3 className="section-title">実機の現在の状態を backup する</h3>
            {backupError === undefined ? (
              <p>この接続で読み込んだ実機の状態を cornix/backups/ に保存している…</p>
            ) : (
              <p className="bad">
                backup を保存できなかったため、書き込みへ進まない: {backupError}
              </p>
            )}
          </section>
        ) : null}

        {index === 1 ? (
          <section>
            <h3 className="section-title">書き込む差分 {changed.length} 件</h3>
            <p className="hint">
              書き込むのは差分だけ。1 件ごとに書き、同じ entry を読み直して確かめる。
            </p>
            <table className="diff-table">
              <thead>
                <tr>
                  <th>種類</th>
                  <th>対象</th>
                  <th>現在（実機）</th>
                  <th>移行後</th>
                </tr>
              </thead>
              <tbody>
                {semantic.map((entry, entryIndex) => (
                  <tr key={`${subjectLabel(entry.subject)}-${entryIndex}`}>
                    <td>
                      <span className={CHANGE_VIEW[entry.change].className}>
                        {CHANGE_VIEW[entry.change].label}
                      </span>
                    </td>
                    <td>{subjectLabel(entry.subject)}</td>
                    <td>
                      {labeledBehavior(entry.subject, entry.before, entry.beforeBehavior, labels)}
                      <code>{entry.before}</code>
                    </td>
                    <td>
                      <strong>
                        {labeledBehavior(entry.subject, entry.after, entry.afterBehavior, labels)}
                      </strong>
                      <code>{entry.after}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {notationOnly.length === 0 ? null : (
              <p className="hint">
                挙動が変わらない表記の差が {notationOnly.length} 件ある。書き込み対象には含める。
              </p>
            )}
            <FatalList fatal={fatal} />
          </section>
        ) : null}

        {index === 2 ? (
          <section>
            <h3 className="section-title">書き込む前の確認</h3>
            {warnings.length === 0 ? (
              <p>承認が要る警告は無い。</p>
            ) : (
              <>
                <p>
                  警告 {warnings.length}{" "}
                  件を確かめる。内容を理解した警告だけ承認する。承認は問題の解決ではなく、根拠の値が変わると外れる。
                </p>
                {warnings.map((diagnostic) => (
                  <label key={diagnostic.id} className="ack">
                    <input
                      type="checkbox"
                      checked={acknowledged.includes(diagnostic.id)}
                      onChange={(event) =>
                        onAcknowledge(
                          event.target.checked
                            ? [...acknowledged, diagnostic.id]
                            : acknowledged.filter((id) => id !== diagnostic.id),
                        )
                      }
                    />
                    <span>
                      <Icon name={SEVERITY_VIEW.warning.icon} /> {SEVERITY_VIEW.warning.label}:{" "}
                      {diagnostic.message}
                      <br />
                      <code>{diagnostic.code}</code> · {subjectLabel(diagnostic.subject)}
                    </span>
                  </label>
                ))}
              </>
            )}
            <FatalList fatal={fatal} />
            <p className="hint">書き込み中は実機を切断しない。</p>
          </section>
        ) : null}

        {index === 3 && state?.phase === "writing" ? (
          <section role="status" aria-live="polite">
            <h3 className="section-title">
              書き込みと確認 {state.verified.length} / {state.plan.operations.length} 件
            </h3>
            <p>
              往復 {roundTrips} / {roundTripTotal} 回。残り時間は推定しない。
            </p>
            <progress max={Math.max(1, roundTripTotal)} value={roundTrips} />
            <ul className="write-rows">
              {state.plan.operations.map((operation, operationIndex) => {
                const done = operationIndex < state.verified.length;
                const active = operationIndex === state.verified.length;
                return (
                  <li
                    key={`${operation.target.kind}-${operationIndex}`}
                    className={done ? "is-done" : active ? "is-active" : ""}
                  >
                    <span>
                      {done ? (
                        <>
                          <Icon name="check" /> 書き込み → 読み直しが一致
                        </>
                      ) : active ? (
                        <>
                          <Icon name="saving" /> 書き込んだ値を読み直している
                        </>
                      ) : (
                        "待機"
                      )}
                    </span>
                    <span>
                      {targetLabel(operation)} {operationDescription(operation, changed, labels)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="hint">中断すると、途中までの状態は持ち越さずに全 read からやり直す。</p>
          </section>
        ) : null}

        {index === 4 && state?.phase === "completed" ? (
          <section>
            <h3 className="section-title ok">
              <Icon name="check" /> {state.verified.length} 件を実機に反映した
            </h3>
            <p>
              1 件ごとに書き込んだ値を読み直し、一致を確かめた。続けて実機を全 read
              し直し、差分を取り直す。
            </p>
            <p className="hint">
              確かめたのは実機に反映されたことまでで、電源を切っても残るかは確認していない。確かめるには、電源を入れ直してから実機を読み込む。
            </p>
          </section>
        ) : null}

        {index === 4 && state?.phase === "aborted" ? (
          <section>
            <h3 className="section-title bad">
              ! 中断した（{state.verified} 件まで確認済み）: {abortReasonLabel(state.reason)}
            </h3>
            <p>
              途中の状態は持ち越さない。再接続し、「実機と適用」から実機を読み込み直して差分を確かめてから、Apply
              をやり直す。
            </p>
          </section>
        ) : null}
      </div>

      <footer className="apply-foot">
        {index < 3 ? (
          <Button appearance="quiet" onClick={onCancel}>
            キャンセル
          </Button>
        ) : null}
        <span className="spacer" />
        {index === 1 ? <Button onClick={onNext}>確認へ進む</Button> : null}
        {index === 2 ? (
          <Button disabled={!canWrite} onClick={onWrite}>
            {changed.length} 件を実機へ書き込む
          </Button>
        ) : null}
        {writing ? (
          <Button appearance="danger" onClick={onCancel}>
            中断
          </Button>
        ) : null}
        {finished && !writing ? <Button onClick={onCancel}>閉じる</Button> : null}
      </footer>
    </dialog>
  );
}

function FatalList({
  fatal,
}: {
  readonly fatal: ApplyGateWithEvidence["fatal"];
}): React.JSX.Element | null {
  if (fatal.length === 0) return null;
  return (
    <div className="fatal-list" role="alert">
      <strong>
        <Icon name="error" /> error があるため書き込めない
      </strong>
      <ul>
        {fatal.map((diagnostic) => (
          <li key={diagnostic.id}>
            <code>{diagnostic.code}</code> {diagnostic.message}
          </li>
        ))}
      </ul>
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
  return name === undefined ? behavior : `${name} — ${behavior}`;
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
      return `layer ${target.layer} / encoder ${target.index} ${target.direction === 0 ? "左回し" : "右回し"}`;
    case "tapDance":
      return `Tap Dance ${target.index}`;
    case "combo":
      return `Combo ${target.index}`;
    case "setting":
      return `settings / qsid ${target.qsid}`;
  }
}
