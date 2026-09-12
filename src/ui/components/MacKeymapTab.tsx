import type { MacWorkspaceState } from "../mac-workspace.ts";
import { Button, Callout, CalloutLabel } from "./ui/index.ts";

/**
 * Mac 内蔵キーボードのタブ。
 *
 * workspace に `mac-keyboard.yaml` が無くても Vial 編集は成立するため、タブは常設し、
 * missing / error をタブ内の状態表示に閉じ込める（ADR 0025）。
 *
 * @doc docs/specs/ui.md#mac-tab
 */
export function MacKeymapTab({
  mac,
  busy,
  onCreate,
}: {
  readonly mac: MacWorkspaceState;
  readonly busy: boolean;
  readonly onCreate: () => void;
}): React.JSX.Element {
  if (mac.kind === "missing") {
    return (
      <section className="mac-tab" aria-label="mac keyboard">
        <div className="empty-state">
          <h1>Mac内蔵キーボードの設定が無い</h1>
          <p>
            workspaceにmac-keyboard.yamlを作成すると、MacBook内蔵キーボードの割り当てを
            ここで編集できます。実機への適用はCLI（cornix mac apply）で行います。
          </p>
          <Button variant="primary" disabled={busy} onClick={onCreate}>
            mac-keyboard.yamlを作成
          </Button>
        </div>
      </section>
    );
  }
  if (mac.kind === "error") {
    return (
      <section className="mac-tab" aria-label="mac keyboard">
        <Callout tone="error">
          <CalloutLabel>mac-keyboard.yamlを読み込めない</CalloutLabel>
          <p>{mac.reason}</p>
          <p>ファイルを修正して「再読込」を押してください。</p>
        </Callout>
      </section>
    );
  }
  return (
    <section className="mac-tab" aria-label="mac keyboard">
      <div className="u-text-sm u-muted">
        layout: {mac.document.layout} / profile: {mac.document.profile} / layer:{" "}
        {mac.document.layers.size}
      </div>
    </section>
  );
}
