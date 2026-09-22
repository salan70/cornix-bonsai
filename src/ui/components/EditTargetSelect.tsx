import type { MacWorkspaceByLayout } from "../mac-workspace.ts";
import { macScopeLabel } from "../mac-workspace.ts";
import type { EditTarget } from "../types.ts";

/** 左レールに常時表示する編集対象リスト。項目が配列ごとになる。
 *
 * @doc docs/specs/ui.md#target-work-navigation
 */
export function EditTargetSelect({
  target,
  mac,
  onChange,
}: {
  readonly target: EditTarget;
  readonly mac: MacWorkspaceByLayout;
  readonly onChange: (target: EditTarget) => void;
}): React.JSX.Element {
  return (
    <div className="target-list" aria-label="編集対象">
      <p>編集対象</p>
      <TargetButton
        active={target.kind === "cornix"}
        label="Cornix LP"
        detail="実機設定 · keymap.yaml"
        onClick={() => onChange({ kind: "cornix" })}
      />
      <TargetButton
        active={target.kind === "mac" && target.layout === "ansi"}
        label="Mac ANSI"
        detail={`ローカル設定 · ${macScopeLabel(mac.ansi)}`}
        onClick={() => onChange({ kind: "mac", layout: "ansi" })}
      />
      <TargetButton
        active={target.kind === "mac" && target.layout === "jis"}
        label="Mac JIS"
        detail={`ローカル設定 · ${macScopeLabel(mac.jis)}`}
        onClick={() => onChange({ kind: "mac", layout: "jis" })}
      />
    </div>
  );
}

function TargetButton({
  active,
  label,
  detail,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly detail: string;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={active ? "is-active" : ""}
      aria-pressed={active}
      onClick={onClick}
    >
      <strong>{label}</strong>
      <small>{detail}</small>
    </button>
  );
}
