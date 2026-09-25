import { useRef } from "react";
import { buildInfo, formatBuildTime } from "../build-info.ts";
import type { MacKeyboardLayout } from "../../core/mac-keymap/types.ts";
import type { ThemePreference } from "../theme.ts";
import type { EditTarget, TargetKey } from "../types.ts";

export type TargetLoadState = "ready" | "missing" | "legacy" | "error";
export type DevicePhase = "disconnected" | "connected" | "reading" | "read";

const TARGETS: readonly {
  readonly key: TargetKey;
  readonly label: string;
  readonly target: EditTarget;
}[] = [
  { key: "cornix", label: "Cornix LP", target: { kind: "cornix" } },
  { key: "ansi", label: "Mac ANSI", target: { kind: "mac", layout: "ansi" } },
  { key: "jis", label: "Mac JIS", target: { kind: "mac", layout: "jis" } },
];

const STATE_VIEW: Readonly<
  Record<TargetLoadState, { readonly label: string; readonly dot: string }>
> = {
  ready: { label: "読込済み", dot: "dot" },
  missing: { label: "ファイルなし", dot: "dot dot-missing" },
  legacy: { label: "移行が必要", dot: "dot dot-legacy" },
  error: { label: "読込失敗", dot: "dot dot-error" },
};

/**
 * 常設の header。brand と build、workspace、編集対象の切替、実機の接続状態、テーマ。
 * 編集対象のうち、このマシンの内蔵配列に「この Mac」を添える（ADR 0034）。
 *
 * workspace を開くまでは brand、build、テーマだけを出す。
 */
export function Header({
  workspaceName,
  onSwitchWorkspace,
  targetKey,
  targetStates,
  onTarget,
  machineLayout,
  device,
  productName,
  theme,
  onTheme,
}: {
  readonly workspaceName: string | undefined;
  readonly onSwitchWorkspace: () => void;
  readonly targetKey: TargetKey;
  readonly targetStates: Readonly<Record<TargetKey, TargetLoadState>> | undefined;
  readonly onTarget: (target: EditTarget) => void;
  /** ローカルサーバーが検出したこのマシンの内蔵配列。適用できる対象に印を付ける。 */
  readonly machineLayout?: MacKeyboardLayout | undefined;
  readonly device: DevicePhase;
  readonly productName: string | undefined;
  readonly theme: ThemePreference;
  readonly onTheme: (theme: ThemePreference) => void;
}): React.JSX.Element {
  const radios = useRef(new Map<TargetKey, HTMLButtonElement>());

  function moveTarget(event: React.KeyboardEvent, index: number): void {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TARGETS[(index + step + TARGETS.length) % TARGETS.length];
    if (next === undefined) return;
    onTarget(next.target);
    radios.current.get(next.key)?.focus();
  }

  const deviceText =
    device === "disconnected"
      ? "未接続"
      : device === "reading"
        ? "読込中"
        : device === "read"
          ? "読込済み"
          : "接続済み";

  return (
    <header className="header">
      <div className="brand">
        <span className="logo" aria-hidden="true">
          🌱
        </span>
        <span>
          <strong>KeySync</strong>
          <small>
            build {buildInfo.commitSha} ·{" "}
            <time dateTime={buildInfo.builtAt}>{formatBuildTime(buildInfo.builtAt)}</time>
          </small>
        </span>
      </div>
      {workspaceName === undefined || targetStates === undefined ? null : (
        <>
          <div className="workspace">
            <span className="muted">workspace</span>
            <code title={workspaceName}>{workspaceName}</code>
            <button type="button" className="link" onClick={onSwitchWorkspace}>
              切り替える
            </button>
          </div>
          <div className="targets" role="radiogroup" aria-label="編集対象">
            {TARGETS.map((item, index) => {
              const state = STATE_VIEW[targetStates[item.key]];
              const checked = item.key === targetKey;
              return (
                <button
                  key={item.key}
                  ref={(element) => {
                    if (element === null) radios.current.delete(item.key);
                    else radios.current.set(item.key, element);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  data-target={item.key}
                  className={checked ? "target is-on" : "target"}
                  onClick={() => onTarget(item.target)}
                  onKeyDown={(event) => moveTarget(event, index)}
                >
                  <span className={state.dot} aria-hidden="true" />
                  {item.label}
                  {item.target.kind === "mac" && item.target.layout === machineLayout ? (
                    <span className="tag tag-on" title="Karabiner へ適用できるのはこの配列">
                      この Mac
                    </span>
                  ) : null}
                  <span className="visually-hidden">（{state.label}）</span>
                </button>
              );
            })}
          </div>
          <span className="spacer" />
          <span
            className={device === "disconnected" ? "chip is-off" : "chip is-on"}
            role="status"
            aria-live="polite"
            title={productName}
          >
            <span aria-hidden="true" className="chip-dot" />
            {device === "disconnected"
              ? "Cornix LP 未接続"
              : `${productName ?? "Cornix LP"} · ${deviceText}`}
          </span>
        </>
      )}
      {workspaceName === undefined ? <span className="spacer" /> : null}
      <label className="theme">
        <span className="visually-hidden">テーマ</span>
        <select
          aria-label="テーマ"
          value={theme}
          onChange={(event) => onTheme(event.target.value as ThemePreference)}
        >
          <option value="system">システム</option>
          <option value="light">ライト</option>
          <option value="dark">ダーク</option>
        </select>
      </label>
    </header>
  );
}
