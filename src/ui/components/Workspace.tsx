import { Fragment } from "react";
import type { MacKeyboardLayout } from "../../core/mac-keymap/types.ts";
import { macKeymapPath, WORKSPACE_LAYOUT } from "../../workspace/layout.ts";
import type { WorkspaceConnection } from "../state/use-workspace.ts";
import type { WorkspaceIssue } from "../workspace-probe.ts";
import { Button } from "./Button.tsx";
import { Logo } from "./Logo.tsx";

/**
 * workspace の入口。サーバーの workspace を開くまでと、開けなかったとき。
 * directory は選ばない（ADR 0038）。workspace 自体を読めなかったときは、理由と再読込を出す。
 */
export function WorkspaceGate({
  connection,
  issue,
  message,
  onReload,
}: {
  readonly connection: WorkspaceConnection;
  readonly issue: WorkspaceIssue | undefined;
  readonly message: string;
  readonly onReload: () => void;
}): React.JSX.Element {
  const view = GATE_VIEW[connection.kind];
  return (
    <main className="gate" id="main">
      <div className="gate-card">
        <Logo size="lg" />
        <h1>{view.title}</h1>
        <p>{connection.kind === "failed" ? connection.message : view.body}</p>
        {connection.kind === "opening" ? null : (
          <div className="row">
            <Button size="large" onClick={onReload}>
              もう一度開く
            </Button>
          </div>
        )}
        <p className="hint">macOS の Chrome / Chromium だけに対応する。</p>
        <p className="hint" role="status" aria-live="polite">
          {message}
        </p>
      </div>
      {issue === undefined ? null : (
        <CornixRecovery
          issue={issue}
          busy={false}
          onInitialize={() => undefined}
          onMigrate={() => undefined}
          onReload={onReload}
        />
      )}
    </main>
  );
}

const GATE_VIEW: Readonly<
  Record<WorkspaceConnection["kind"], { readonly title: string; readonly body: string }>
> = {
  opening: {
    title: "workspace を開いている",
    body: "ローカルサーバーから workspace を読んでいる。",
  },
  opened: {
    title: "workspace を読み込めなかった",
    body: "外部エディタで原因を直してから、もう一度開く。",
  },
  unreachable: {
    title: "ローカルサーバーに接続できない",
    body: "just ui で起動したサーバーから開く。workspace の読み書きはサーバーが行う。",
  },
  failed: { title: "workspace を開けなかった", body: "" },
};

/**
 * Cornix LP を読み込めないときの復旧。`keymap.yaml` が無い、旧 digest の binding、改名前の
 * 管理ディレクトリ、その他の失敗を分けて操作を出す。
 * Mac の編集は止めない。
 */
export function CornixRecovery({
  issue,
  busy,
  onInitialize,
  onMigrate,
  onReload,
}: {
  readonly issue: WorkspaceIssue;
  readonly busy: boolean;
  readonly onInitialize: () => void;
  readonly onMigrate: () => void;
  readonly onReload: () => void;
}): React.JSX.Element {
  if (issue.kind === "missing-keymap") {
    return (
      <section className="recovery" aria-labelledby="recovery-title" data-recovery="missing-keymap">
        <h2 id="recovery-title">! keymap.yaml が無い</h2>
        <p>
          <code>{issue.store.root}</code> には Cornix LP の設定がまだ無い。実機を full read して、
          <code>{WORKSPACE_LAYOUT.keymap}</code> と{" "}
          <code>{WORKSPACE_LAYOUT.definitions}/&lt;digest&gt;.json</code>{" "}
          を作る。実機には書き込まない。
        </p>
        <p className="muted">
          Mac キーボードの設定は、header の編集対象から選べばこのまま編集できる。
        </p>
        <div className="row">
          <Button disabled={busy} onClick={onInitialize}>
            実機 read で workspace を作成
          </Button>
          <Button appearance="secondary" disabled={busy} onClick={onReload}>
            ディスクから再読込
          </Button>
        </div>
      </section>
    );
  }
  if (issue.kind === "legacy-binding") {
    return (
      <section className="recovery" aria-labelledby="recovery-title" data-recovery="legacy-binding">
        <h2 id="recovery-title">! definition binding が古い digest 規則のまま</h2>
        <p>
          keymap.yaml が指す definition は記録当時と同じ内容だと確かめられた。digest
          の計算規則が変わったため一致しなくなっている。 binding
          を今の規則へ移行できる。移行はこの操作でだけ行い、keymap の内容は変わらない。
        </p>
        <dl className="kv">
          <dt>現在</dt>
          <dd>
            <code>{issue.migration.previousPath}</code>
            <br />
            <code>{issue.migration.previousDigest}</code>
          </dd>
          <dt>移行後</dt>
          <dd>
            <code>{issue.migration.definitionPath}</code>
            <br />
            <code>{issue.migration.definitionDigest}</code>
          </dd>
        </dl>
        <p className="muted">
          移行後、<code>{issue.migration.previousPath}</code> は参照されなくなる。不要なら削除する。
        </p>
        <div className="row">
          <Button disabled={busy} onClick={onMigrate}>
            binding を移行する
          </Button>
          <Button appearance="secondary" disabled={busy} onClick={onReload}>
            ディスクから再読込
          </Button>
        </div>
      </section>
    );
  }
  if (issue.kind === "legacy-layout") {
    return (
      <section className="recovery" aria-labelledby="recovery-title" data-recovery="legacy-layout">
        <h2 id="recovery-title">! 改名前の cornix/ を使っている</h2>
        <p>
          KeySync への改名で、管理ディレクトリは cornix/ から keysync/ に変わった。keymap.yaml
          が指す definition は記録当時と同じ内容だと確かめられた。次のファイルを keysync/ へ写し、
          keymap.yaml の path を書き直せる。移行はこの操作でだけ行い、keymap の内容は変わらない。
        </p>
        <dl className="kv">
          <dt>definition</dt>
          <dd>
            <code>{issue.migration.previousPath}</code>
            <br />→ <code>{issue.migration.definitionPath}</code>
          </dd>
          {issue.migration.copies.map((copy) => (
            <Fragment key={copy.to}>
              <dt>写す</dt>
              <dd>
                <code>{copy.from}</code>
                <br />→ <code>{copy.to}</code>
              </dd>
            </Fragment>
          ))}
        </dl>
        <p className="muted">
          cornix/ は削除しない。backups/ と generated/
          は生成物なので写さない。移行後に確かめ、不要なら cornix/ を削除する。
        </p>
        <div className="row">
          <Button disabled={busy} onClick={onMigrate}>
            keysync/ へ移行する
          </Button>
          <Button appearance="secondary" disabled={busy} onClick={onReload}>
            ディスクから再読込
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section
      className="recovery is-error"
      aria-labelledby="recovery-title"
      data-recovery="unresolved"
    >
      <h2 id="recovery-title">! workspace を読み込めなかった</h2>
      <p className="bad">{issue.reason}</p>
      <p>外部エディタで原因を直してから再読込する。</p>
      <div className="row">
        <Button appearance="secondary" disabled={busy} onClick={onReload}>
          ディスクから再読込
        </Button>
      </div>
    </section>
  );
}

/** Mac の配列ファイルが無い、または読めないときの復旧。 */
export function MacRecovery({
  layout,
  state,
  busy,
  onCreate,
  onReload,
}: {
  readonly layout: MacKeyboardLayout;
  readonly state:
    | { readonly kind: "missing" }
    | { readonly kind: "error"; readonly reason: string };
  readonly busy: boolean;
  readonly onCreate: () => void;
  readonly onReload: () => void;
}): React.JSX.Element {
  const path = macKeymapPath(layout);
  if (state.kind === "missing") {
    return (
      <section className="recovery" aria-labelledby="recovery-title" data-recovery="mac-missing">
        <h2 id="recovery-title">! {path} が無い</h2>
        <p>
          Mac キーボード（{layout.toUpperCase()}）の設定ファイルがまだ無い。選んだ配列と空の layer 0
          だけを持つ初期ファイルを作れる。
        </p>
        <div className="row">
          <Button disabled={busy} onClick={onCreate}>
            {path} を作成
          </Button>
          <Button appearance="secondary" disabled={busy} onClick={onReload}>
            ディスクから再読込
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section
      className="recovery is-error"
      aria-labelledby="recovery-title"
      data-recovery="mac-error"
    >
      <h2 id="recovery-title">! {path} を読み込めない</h2>
      <p className="bad">{state.reason}</p>
      <p>外部エディタで直してから再読込する。Cornix LP の編集はこのまま使える。</p>
      <div className="row">
        <Button appearance="secondary" disabled={busy} onClick={onReload}>
          ディスクから再読込
        </Button>
      </div>
    </section>
  );
}
