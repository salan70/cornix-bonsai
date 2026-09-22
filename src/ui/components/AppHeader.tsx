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
  canEditCornix,
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
  readonly canEditCornix: boolean;
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
        <div className="header-group header-group--connection">
          <Chip connected={device !== undefined} dot aria-live="polite">
            {device === undefined ? "未接続" : `${device.info.productName} に接続済み`}
          </Chip>
        </div>
        <div className="header-primary-actions">
          <Button onClick={onOpenWorkspace}>Workspace</Button>
          <details className="header-menu">
            <summary>その他</summary>
            <div className="header-menu__content">
              <section className="header-menu__section" aria-labelledby="header-menu-device">
                <span className="header-menu__label" id="header-menu-device">
                  接続
                </span>
                <Button onClick={onConnect}>接続</Button>
                <Button onClick={onDisconnect} disabled={device === undefined}>
                  切断
                </Button>
                <Button onClick={onRead} disabled={device === undefined}>
                  実機から再読み込み
                </Button>
              </section>
              <section className="header-menu__section" aria-labelledby="header-menu-workspace">
                <span className="header-menu__label" id="header-menu-workspace">
                  Workspace
                </span>
                <Button onClick={onImportVil} disabled={!canEditCornix}>
                  VIL読込
                </Button>
                <Button onClick={onExportVil} disabled={!canEditCornix}>
                  VIL書出
                </Button>
                <Button onClick={onReload} disabled={!canReload}>
                  再読込
                </Button>
                <Button variant="ghost" onClick={onRestoreBackup} disabled={!canEditCornix}>
                  backup から復元
                </Button>
              </section>
            </div>
          </details>
        </div>
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
