import type { WebHidConnection } from "../../device/webhid.ts";
import type { ThemePreference } from "../theme.ts";

/** @doc docs/specs/ui.md#header-and-status */
export function AppHeader({
  workspaceName,
  device,
  onOpenWorkspace,
  onReload,
  onRestoreBackup,
  onConnect,
  onDisconnect,
  onRead,
  themePreference,
  onThemePreferenceChange,
  canReload,
}: {
  readonly workspaceName: string | undefined;
  readonly device: WebHidConnection | undefined;
  readonly onOpenWorkspace: () => void;
  readonly onReload: () => void;
  readonly onRestoreBackup: () => void;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
  readonly onRead: () => void;
  readonly themePreference: ThemePreference;
  readonly onThemePreferenceChange: (preference: ThemePreference) => void;
  readonly canReload: boolean;
}): React.JSX.Element {
  return (
    <header className="hdr">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          🌱
        </span>
        <strong>Cornix Bonsai</strong>
      </div>
      <div className="ws">
        <span>workspace</span>
        <b className="mono">{workspaceName ?? "未選択"}</b>
      </div>
      <div className="header-actions">
        <span className={`chip ${device === undefined ? "" : "connected"}`} aria-live="polite">
          <span className="dot" />
          {device === undefined ? "未接続" : `${device.info.productName} に接続済み`}
        </span>
        <button className="btn" onClick={onOpenWorkspace}>
          Workspace
        </button>
        <button className="btn" onClick={onRead} disabled={device === undefined}>
          実機から再読み込み
        </button>
        <label className="theme-control">
          <span>テーマ</span>
          <select
            aria-label="テーマ"
            value={themePreference}
            onChange={(event) => onThemePreferenceChange(event.target.value as ThemePreference)}
          >
            <option value="system">システム</option>
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
          </select>
        </label>
        <button className="btn secondary" onClick={onRestoreBackup} disabled={!canReload}>
          backup から復元
        </button>
        <button className="btn" onClick={onConnect}>
          接続
        </button>
        <button className="btn" onClick={onDisconnect} disabled={device === undefined}>
          切断
        </button>
        <button className="btn" onClick={onReload} disabled={!canReload}>
          再読込
        </button>
      </div>
    </header>
  );
}
