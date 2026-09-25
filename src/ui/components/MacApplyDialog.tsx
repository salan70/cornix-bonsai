import { useEffect, useRef } from "react";
import type { MacKeyboardLayout, MacKeymapDocument } from "../../core/mac-keymap/types.ts";
import type { MacDiffEntryView, MacPlanned } from "../../server/protocol.ts";
import { LAYOUT_LABEL } from "../mac-apply-gate.ts";
import { macKeycapLabel } from "../mac-keycap-labels.ts";
import type { MacApplyOutcome, MacApplyStopped, MacApplyView } from "../state/use-mac-apply.ts";
import { Button } from "./Button.tsx";
import { Icon } from "./Icon.tsx";

const CHANGE_VIEW: Readonly<
  Record<MacDiffEntryView["change"], { readonly label: string; readonly className: string }>
> = {
  added: { label: "追加", className: "tag tag-add" },
  changed: { label: "変更", className: "tag tag-change" },
  removed: { label: "削除", className: "tag tag-remove" },
};

/** `karabiner.json` を backup から戻す手順。書き込みの後に失敗したときに示す。 */
const KARABINER_PATH = "~/.config/karabiner/karabiner.json";

/**
 * Karabiner への適用。差分確認 → 適用 → 結果の modal。
 *
 * 書き込みと profile の切り替えはローカルサーバーが行う（ADR 0034）。適用中は閉じられない。
 */
export function MacApplyDialog({
  view,
  layout,
  document,
  onApply,
  onRetrySelect,
  onReload,
  onClose,
}: {
  readonly view: Exclude<MacApplyView, { phase: "closed" }>;
  readonly layout: MacKeyboardLayout;
  readonly document: MacKeymapDocument | undefined;
  readonly onApply: () => void;
  readonly onRetrySelect: () => void;
  readonly onReload: () => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const busy =
    view.phase === "planning" ||
    view.phase === "applying" ||
    (view.phase === "result" && view.retrying);

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
  }, [view.phase]);

  const upToDate =
    view.phase === "review" && view.plan.entries.length === 0 && !view.plan.selection.required;

  return (
    <dialog
      ref={dialogRef}
      className="apply"
      data-mac-apply-dialog
      data-phase={view.phase}
      aria-labelledby="mac-apply-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="apply-head">
        <h2 id="mac-apply-title" ref={headingRef} tabIndex={-1}>
          Karabiner へ適用（Mac {LAYOUT_LABEL[layout]}）
        </h2>
      </header>

      <div className="apply-body" aria-busy={busy}>
        {view.phase === "planning" ? (
          <section role="status" aria-live="polite">
            <p>差分を計算している…</p>
          </section>
        ) : null}

        {view.phase === "stopped" ? <Stopped reason={view.reason} onReload={onReload} /> : null}

        {view.phase === "review" || view.phase === "applying" ? (
          <Review
            plan={view.plan}
            layout={layout}
            document={document}
            changed={view.phase === "review" && view.changed}
            upToDate={upToDate}
          />
        ) : null}

        {view.phase === "applying" ? (
          <p role="status" aria-live="polite">
            適用している…
          </p>
        ) : null}

        {view.phase === "result" ? (
          <Result outcome={view.outcome} retrying={view.retrying} onReload={onReload} />
        ) : null}
      </div>

      <footer className="apply-foot">
        {view.phase === "review" || view.phase === "stopped" ? (
          <Button appearance="quiet" onClick={onClose}>
            キャンセル
          </Button>
        ) : null}
        <span className="spacer" />
        {view.phase === "review" ? (
          <Button disabled={upToDate} onClick={onApply}>
            適用
          </Button>
        ) : null}
        {view.phase === "result" && view.outcome.kind === "select-failed" ? (
          <Button appearance="secondary" disabled={view.retrying} onClick={onRetrySelect}>
            切り替えを再試行
          </Button>
        ) : null}
        {view.phase === "result" ? (
          <Button disabled={view.retrying} onClick={onClose}>
            閉じる
          </Button>
        ) : null}
      </footer>
    </dialog>
  );
}

function Review({
  plan,
  layout,
  document,
  changed,
  upToDate,
}: {
  readonly plan: MacPlanned;
  readonly layout: MacKeyboardLayout;
  readonly document: MacKeymapDocument | undefined;
  readonly changed: boolean;
  readonly upToDate: boolean;
}): React.JSX.Element {
  const notes = plan.diagnostics.filter((diagnostic) => diagnostic.severity !== "error");
  return (
    <section>
      {changed ? (
        <p className="bad" role="alert">
          計画を組んだ後に内容が変わった。新しい差分を確かめてから適用する。
        </p>
      ) : null}
      <p className="hint">
        <code>{plan.source}</code> → <code>{plan.karabiner}</code> の「{plan.selection.profile}
        」profile
      </p>
      {upToDate ? (
        <p className="ok">
          <Icon name="check" /> このマシンは最新。適用する差分は無い。
        </p>
      ) : (
        <>
          <h3 className="section-title">適用する差分 {plan.entries.length} 件</h3>
          {plan.entries.length === 0 ? null : (
            <table className="diff-table">
              <thead>
                <tr>
                  <th scope="col">layer</th>
                  <th scope="col">キー</th>
                  <th scope="col">割り当て</th>
                  <th scope="col">変化</th>
                </tr>
              </thead>
              <tbody>
                {plan.entries.map((entry) => (
                  <tr key={`${entry.layer} ${entry.keyCode}`}>
                    <td>{entry.layer ?? "—"}</td>
                    <td>{macKeycapLabel(entry.keyCode, layout)}</td>
                    <td>
                      <code>
                        {entry.change === "removed" || entry.layer === null
                          ? "—"
                          : (document?.layers.get(entry.layer)?.get(entry.keyCode) ?? "—")}
                      </code>
                    </td>
                    <td>
                      <span className={CHANGE_VIEW[entry.change].className}>
                        {CHANGE_VIEW[entry.change].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {notes.length === 0 ? null : (
            <ul className="hint">
              {notes.map((diagnostic) => (
                <li key={diagnostic.id}>{diagnostic.message}</li>
              ))}
            </ul>
          )}
          <p className="hint">適用の前に現在の karabiner.json を keysync/backups/ へ退避する。</p>
        </>
      )}
    </section>
  );
}

function Stopped({
  reason,
  onReload,
}: {
  readonly reason: MacApplyStopped;
  readonly onReload: () => void;
}): React.JSX.Element {
  return (
    <section role="alert">
      <h3 className="section-title bad">
        <Icon name="error" /> 適用できない（karabiner.json には触れていない）
      </h3>
      <StoppedDetail reason={reason} onReload={onReload} />
    </section>
  );
}

function StoppedDetail({
  reason,
  onReload,
}: {
  readonly reason: MacApplyStopped;
  readonly onReload: () => void;
}): React.JSX.Element {
  switch (reason.kind) {
    case "layout-mismatch":
      return (
        <p>
          {reason.machine === null
            ? "この Mac の配列を検出できない。"
            : `この Mac は ${LAYOUT_LABEL[reason.machine]}。`}
          {LAYOUT_LABEL[reason.requested]} の設定は {LAYOUT_LABEL[reason.requested]} の Mac
          で適用する。
        </p>
      );
    case "missing":
      return (
        <p>
          <code>{reason.path}</code> が無い。
        </p>
      );
    case "digest-mismatch":
      return (
        <>
          <p>
            画面の内容と <code>{reason.path}</code> の内容が違う。Web UI
            で開いているフォルダと、サーバーが読むリポジトリが別の場所の可能性がある。
          </p>
          <Button size="small" appearance="secondary" onClick={onReload}>
            再読込
          </Button>
        </>
      );
    case "invalid":
      return (
        <ul>
          {reason.diagnostics
            .filter((diagnostic) => diagnostic.severity === "error")
            .map((diagnostic) => (
              <li key={diagnostic.id}>
                <code>{diagnostic.code}</code> {diagnostic.message}
              </li>
            ))}
        </ul>
      );
    case "karabiner-missing":
      return <p>Karabiner-Elements が見つからない。</p>;
    case "lint-failed":
      return (
        <>
          <p>Karabiner の lint が通らない。</p>
          <pre className="code-block">{reason.output}</pre>
        </>
      );
    case "unreachable":
      return <p>サーバーに接続できない。just ui を起動する。</p>;
    case "rejected":
      return <p>サーバーがリクエストを拒否した: {reason.reason}</p>;
    case "failed":
      return <p>{reason.message}</p>;
  }
}

function Result({
  outcome,
  retrying,
  onReload,
}: {
  readonly outcome: MacApplyOutcome;
  readonly retrying: boolean;
  readonly onReload: () => void;
}): React.JSX.Element {
  switch (outcome.kind) {
    case "applied":
      return (
        <section role="status" aria-live="polite">
          <h3 className="section-title ok">
            <Icon name="check" /> 適用した
          </h3>
          <p className="backup-row">
            <span>
              適用前の設定を <code>{outcome.backup}</code> に退避した
            </span>
          </p>
          {outcome.selected ? <p>KeySync profile へ切り替えた。</p> : null}
        </section>
      );
    case "verify-failed":
      return (
        <section role="alert">
          <h3 className="section-title bad">
            <Icon name="error" /> 書き込んだ内容を読み直すと一致しなかった
          </h3>
          <Restore backup={outcome.backup} />
        </section>
      );
    case "select-failed":
      return (
        <section role="alert" aria-busy={retrying}>
          <h3 className="section-title bad">
            <Icon name="warning" /> 書き込みは完了した。profile の切り替えに失敗した
          </h3>
          <p>
            書き込みは巻き戻していない。「切り替えを再試行」するか、Karabiner-Elements で「
            {outcome.profile}」を選ぶ。
          </p>
          {outcome.output === "" ? null : <pre className="code-block">{outcome.output}</pre>}
          <Restore backup={outcome.backup} />
        </section>
      );
    default:
      return (
        <section role="alert">
          <h3 className="section-title bad">
            <Icon name="error" /> 適用できなかった
          </h3>
          <StoppedDetail reason={outcome} onReload={onReload} />
          {outcome.kind === "failed" ? (
            <p className="hint">
              書き込みの途中で失敗した場合も、適用前の設定は keysync/backups/ に退避してある。
            </p>
          ) : null}
        </section>
      );
  }
}

function Restore({ backup }: { readonly backup: string }): React.JSX.Element {
  return (
    <p className="hint">
      元に戻すには <code>{backup}</code> を <code>{KARABINER_PATH}</code> へコピーする。
    </p>
  );
}
