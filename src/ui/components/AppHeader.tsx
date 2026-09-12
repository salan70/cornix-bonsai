import type { WebHidConnection } from "../../device/webhid.ts";
import { buildInfo, formatBuildTime } from "../build-info.ts";
import type { ThemePreference } from "../theme.ts";
import { Button, Chip } from "./ui/index.ts";

/** @doc docs/specs/ui.md#header-and-status */
export function AppHeader({
  workspaceName,
  device,
  onOpenWorkspace,
  onImportVil,
  onExportVil,
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
  readonly onImportVil: () => void;
  readonly onExportVil: () => void;
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
        <span className="build-info">
          build {buildInfo.commitSha} ·{" "}
          <time dateTime={buildInfo.builtAt}>{formatBuildTime(buildInfo.builtAt)}</time>
        </span>
      </div>
      <div className="ws">
        <span>workspace</span>
        <b className="u-mono">{workspaceName ?? "未選択"}</b>
      </div>
      <div className="header-actions">
        <div className="header-group">
          <Chip connected={device !== undefined} dot aria-live="polite">
            {device === undefined ? "未接続" : `${device.info.productName} に接続済み`}
          </Chip>
          <Button onClick={onConnect}>接続</Button>
          <Button onClick={onDisconnect} disabled={device === undefined}>
            切断
          </Button>
          <Button onClick={onRead} disabled={device === undefined}>
            実機から再読み込み
          </Button>
        </div>
        <div className="chrome-divider" aria-hidden="true" />
        <div className="header-group">
          <Button onClick={onOpenWorkspace}>Workspace</Button>
          <Button onClick={onImportVil} disabled={!canReload}>
            VIL読込
          </Button>
          <Button onClick={onExportVil} disabled={!canReload}>
            VIL書出
          </Button>
          <Button onClick={onReload} disabled={!canReload}>
            再読込
          </Button>
        </div>
        <div className="chrome-divider" aria-hidden="true" />
        <Button variant="ghost" onClick={onRestoreBackup} disabled={!canReload}>
          backup から復元
        </Button>
        <div className="chrome-divider" aria-hidden="true" />
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
      </div>
    </header>
  );
}
