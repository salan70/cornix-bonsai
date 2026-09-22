import { Button } from "./Button.tsx";

export type SaveState =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "error"; readonly message: string };

export function SaveStatus({
  state,
  path,
  onRetry,
}: {
  readonly state: SaveState;
  readonly path: string;
  readonly onRetry?: () => void;
}): React.JSX.Element {
  const className =
    state.kind === "saving"
      ? "save-status save-status--saving"
      : state.kind === "saved"
        ? "save-status save-status--saved"
        : state.kind === "error"
          ? "save-status save-status--error"
          : "save-status";
  const content =
    state.kind === "saving"
      ? "保存中…"
      : state.kind === "saved"
        ? "ローカル保存済み"
        : state.kind === "error"
          ? `保存失敗: ${state.message}`
          : "未保存の変更はありません";
  return (
    <div className={className} role="status" aria-live="polite">
      <span className="save-status__label">{content}</span>
      <span className="save-status__path">{path}</span>
      {state.kind === "error" && onRetry !== undefined ? (
        <Button variant="secondary" onClick={onRetry}>
          再試行
        </Button>
      ) : null}
      <span className="save-status__hint">ローカルファイルのみ。実機への反映は Apply。</span>
    </div>
  );
}
