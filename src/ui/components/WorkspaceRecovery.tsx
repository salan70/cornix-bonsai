import type { BindingMigration } from "../../workspace/bootstrap.ts";
import type { BrowserWorkspaceStore } from "../browser-workspace.ts";
import { WORKSPACE_LAYOUT } from "../../workspace/layout.ts";

type WorkspaceIssue =
  | { readonly kind: "missing-keymap"; readonly store: BrowserWorkspaceStore }
  | {
      readonly kind: "legacy-binding";
      readonly store: BrowserWorkspaceStore;
      readonly migration: BindingMigration;
    }
  | { readonly kind: "unresolved"; readonly store: BrowserWorkspaceStore; readonly reason: string };

/** @doc docs/specs/ui.md#workspace-recovery */
export function WorkspaceRecovery({
  issue,
  busy,
  onInitialize,
  onMigrate,
  onRetry,
}: {
  readonly issue: WorkspaceIssue;
  readonly busy: boolean;
  readonly onInitialize: () => void;
  readonly onMigrate: () => void;
  readonly onRetry: () => void;
}): React.JSX.Element {
  if (issue.kind === "missing-keymap") {
    return (
      <section className="recovery">
        <h2>keymap.yamlが無い</h2>
        <p>
          <code>{issue.store.directory.name}</code>{" "}
          にkeymap.yamlが無いため、まだworkspaceになっていません。実機をfull
          readして初期状態を作成できます。
        </p>
        <p className="recovery-detail">
          作成するのは <code>{WORKSPACE_LAYOUT.keymap}</code> と{" "}
          <code>{WORKSPACE_LAYOUT.definitions}/&lt;digest&gt;.json</code>{" "}
          の2つです。実機へは書き込みません。
        </p>
        <div className="recovery-actions">
          <button className="primary" disabled={busy} onClick={onInitialize}>
            実機readでworkspaceを作成
          </button>
        </div>
      </section>
    );
  }
  if (issue.kind === "legacy-binding") {
    return (
      <section className="recovery">
        <h2>definition bindingが古いdigest規則のまま</h2>
        <p>
          keymap.yamlが指すdefinitionは<strong>内容が記録当時と同じ</strong>
          ですが、digestの計算規則が変わったため一致しなくなっています。内容が同じであることを確認できたので、実機なしでbindingを移行できます。
        </p>
        <dl className="recovery-detail">
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
        <p className="recovery-detail">
          keymapの内容は変わりません。移行後、<code>{issue.migration.previousPath}</code>{" "}
          は参照されなくなるので、不要なら削除してください。
        </p>
        <div className="recovery-actions">
          <button className="primary" disabled={busy} onClick={onMigrate}>
            bindingを移行する
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="recovery">
      <h2>workspaceを読み込めなかった</h2>
      <p className="error">{issue.reason}</p>
      <p className="recovery-detail">
        別のdirectoryを選ぶか、原因を直してから再読み込みしてください。
      </p>
      <div className="recovery-actions">
        <button disabled={busy} onClick={onRetry}>
          再読み込み
        </button>
      </div>
    </section>
  );
}
