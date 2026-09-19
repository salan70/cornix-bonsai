import type { MacWorkspaceByLayout } from "../mac-workspace.ts";
import { macScopeLabel } from "../mac-workspace.ts";
import type { EditTarget } from "../types.ts";

/** header 直下の編集対象ドロップダウン。項目が配列ごとになる。 */
export function EditTargetSelect({
  target,
  mac,
  onChange,
}: {
  readonly target: EditTarget;
  readonly mac: MacWorkspaceByLayout;
  readonly onChange: (target: EditTarget) => void;
}): React.JSX.Element {
  const value = target.kind === "cornix" ? "cornix" : `mac:${target.layout}`;
  return (
    <div className="target-bar">
      <label>
        <span>編集対象</span>
        <select
          aria-label="編集対象"
          value={value}
          onChange={(event) => onChange(parseEditTarget(event.target.value))}
        >
          <option value="cornix">Cornix LP（実機）</option>
          <option value="mac:ansi">Mac キーボード（ANSI）— {macScopeLabel(mac.ansi)}</option>
          <option value="mac:jis">Mac キーボード（JIS）— {macScopeLabel(mac.jis)}</option>
        </select>
      </label>
    </div>
  );
}

function parseEditTarget(value: string): EditTarget {
  if (value === "mac:ansi") return { kind: "mac", layout: "ansi" };
  if (value === "mac:jis") return { kind: "mac", layout: "jis" };
  return { kind: "cornix" };
}
