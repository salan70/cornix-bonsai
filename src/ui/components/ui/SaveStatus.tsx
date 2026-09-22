import { Button } from "./Button.tsx";

export type SaveState =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "conflict"; readonly message: string };

export function SaveStatus({
  state,
  path,
  applyHint,
  onRetry,
  onReload,
}: {
  readonly state: SaveState;
  readonly path: string;
  readonly applyHint: string;
  readonly onRetry?: () => void;
  readonly onReload?: () => void;
}): React.JSX.Element {
  const className =
    state.kind === "saving"
      ? "c-save-status c-save-status--saving"
      : state.kind === "saved"
        ? "c-save-status c-save-status--saved"
        : state.kind === "error"
          ? "c-save-status c-save-status--error"
          : state.kind === "conflict"
            ? "c-save-status c-save-status--conflict"
            : "c-save-status";
  const content =
    state.kind === "saving"
      ? "保存中…"
      : state.kind === "saved"
        ? "ローカル保存済み"
        : state.kind === "conflict"
          ? "外部変更のため保存できません"
          : state.kind === "error"
            ? `保存失敗: ${state.message}`
            : "未保存の変更はありません";
  return (
    <div className={className}>
      <span className="c-save-status__label" role="status" aria-live="polite">
        {content}
      </span>
      {state.kind === "conflict" ? (
        <span className="c-save-status__warning">
          未保存の編集は失われています。再読み込みして外部変更を取り込みます。
        </span>
      ) : null}
      <span className="c-save-status__path">{path}</span>
      {state.kind === "error" && onRetry !== undefined ? (
        <Button variant="secondary" onClick={onRetry}>
          再試行
        </Button>
      ) : null}
      {state.kind === "conflict" && onReload !== undefined ? (
        <Button variant="secondary" onClick={onReload}>
          再読み込み
        </Button>
      ) : null}
      <span className="c-save-status__hint">ローカルファイルのみ。{applyHint}</span>
    </div>
  );
}
