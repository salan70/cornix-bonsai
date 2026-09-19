import type { MacKeyboardLayout } from "../../core/mac-keymap/types.ts";
import { validateMacKeymap } from "../../core/mac-keymap/validate.ts";
import { macKeymapPath } from "../../workspace/layout.ts";
import { describeDevices, deviceIfText } from "../mac-references.ts";
import type { MacWorkspaceState } from "../mac-workspace.ts";
import { Callout, CalloutLabel, Panel } from "./ui/index.ts";

/**
 * 選んだ物理配列の参照情報。Vial の usages / unused は持たない。
 *
 * @doc docs/specs/ui.md#behaviors-and-references
 */
export function MacReferences({
  layout,
  mac,
}: {
  readonly layout: MacKeyboardLayout;
  readonly mac: MacWorkspaceState;
}): React.JSX.Element {
  if (mac.kind === "missing") {
    return (
      <Panel as="section" wide>
        <h1>References</h1>
        <p>{macKeymapPath(layout)} がまだ無い。</p>
      </Panel>
    );
  }
  if (mac.kind === "error") {
    return (
      <Panel as="section" wide>
        <h1>References</h1>
        <Callout tone="error">
          <CalloutLabel>読み込めない</CalloutLabel>
          <p>{mac.reason}</p>
        </Callout>
      </Panel>
    );
  }

  const { document, path } = mac;
  const validation = validateMacKeymap(document);
  const assignmentCount = [...document.layers.values()].reduce(
    (total, layer) => total + layer.size,
    0,
  );
  const unsupportedCount = validation.diagnostics.filter((diagnostic) =>
    diagnostic.code.startsWith("mac-keymap/unsupported"),
  ).length;

  return (
    <Panel as="section" wide>
      <h1>References</h1>
      <dl className="mac-refs">
        <div>
          <dt>ファイル</dt>
          <dd className="u-mono">{path}</dd>
        </div>
        <div>
          <dt>物理配列</dt>
          <dd>{document.layout.toUpperCase()}</dd>
        </div>
        <div>
          <dt>適用先デバイス</dt>
          <dd>{describeDevices(document.devices)}</dd>
        </div>
        <div>
          <dt>device_if</dt>
          <dd className="u-mono">{deviceIfText(document.devices)}</dd>
        </div>
        <div>
          <dt>検出した内蔵配列</dt>
          <dd>Browser では検出しない。CLI が apply / diff 時に検出する。</dd>
        </div>
        <div>
          <dt>layer 数</dt>
          <dd>{document.layers.size}</dd>
        </div>
        <div>
          <dt>割り当て数</dt>
          <dd>{assignmentCount}</dd>
        </div>
        <div>
          <dt>非対応件数</dt>
          <dd>{unsupportedCount}</dd>
        </div>
      </dl>
      <h2>Diagnostics</h2>
      {validation.diagnostics.length === 0 ? (
        <p>診断はありません。</p>
      ) : (
        <ul className="diagnostics">
          {validation.diagnostics.map((diagnostic) => (
            <li key={diagnostic.id}>
              <span className={`sev--${severityClass(diagnostic.severity)}`}>
                {diagnostic.severity}
              </span>{" "}
              <code>{diagnostic.code}</code> {diagnostic.message}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function severityClass(severity: string): string {
  return severity === "error" ? "error" : severity === "warning" ? "warning" : "info";
}
