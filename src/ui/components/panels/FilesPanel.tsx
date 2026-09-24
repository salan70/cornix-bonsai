import { Button } from "../Button.tsx";

export const USER_GUIDE_URL =
  "https://github.com/salan70/cornix-bonsai/blob/main/docs/user-guide/web-ui.md";

/** ファイル。.vil の読込・書出、ディスクからの再読込、利用者ガイド。 */
export function FilesPanel({
  cornixReady,
  canReload,
  onImportVil,
  onExportVil,
  onReload,
}: {
  readonly cornixReady: boolean;
  readonly canReload: boolean;
  readonly onImportVil: () => void;
  readonly onExportVil: () => void;
  readonly onReload: () => void;
}): React.JSX.Element {
  return (
    <div className="steps">
      <section className="step">
        <h3 className="section-title">.vil</h3>
        <p>
          読込は目標状態（keymap.yaml）を置き換えて保存する。実機には書き込まない。書出は
          cornix/generated/ に保存する。
        </p>
        <div className="row">
          <Button size="small" appearance="secondary" disabled={!cornixReady} onClick={onImportVil}>
            VIL 読込…
          </Button>
          <Button size="small" appearance="secondary" disabled={!cornixReady} onClick={onExportVil}>
            VIL 書出
          </Button>
        </div>
        {cornixReady ? null : <p className="hint">keymap.yaml を読み込めていないため使えない。</p>}
      </section>
      <section className="step">
        <h3 className="section-title">ディスクから再読込</h3>
        <p>
          外部エディタで変えたファイルを取り込む。保存の競合もここで解ける。未保存の編集は取り込まない。
        </p>
        <Button size="small" appearance="secondary" disabled={!canReload} onClick={onReload}>
          再読込
        </Button>
      </section>
      <section className="step">
        <h3 className="section-title">利用者ガイド</h3>
        <p>操作、安全な Apply、復旧の手順をまとめている。</p>
        <a className="link" href={USER_GUIDE_URL} target="_blank" rel="noreferrer">
          Web UI の使い方（新しいタブで開く）
        </a>
      </section>
    </div>
  );
}
