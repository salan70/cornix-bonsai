import type { IconStyle } from "../../icon-style.ts";
import { Button } from "../Button.tsx";
import { Icon } from "../Icon.tsx";

export const USER_GUIDE_URL =
  "https://github.com/salan70/cornix-bonsai/blob/main/docs/user-guide/web-ui.md";

const ICON_STYLE_OPTIONS: readonly { readonly value: IconStyle; readonly label: string }[] = [
  { value: "dish", label: "凹みあり" },
  { value: "flat", label: "凹みなし" },
];

/** ファイル。.vil の読込・書出、ディスクからの再読込、表示の設定、利用者ガイド。 */
export function FilesPanel({
  cornixReady,
  canReload,
  onImportVil,
  onExportVil,
  onReload,
  iconStyle,
  onIconStyle,
}: {
  readonly cornixReady: boolean;
  readonly canReload: boolean;
  readonly onImportVil: () => void;
  readonly onExportVil: () => void;
  readonly onReload: () => void;
  readonly iconStyle: IconStyle;
  readonly onIconStyle: (style: IconStyle) => void;
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
        <h3 className="section-title">表示</h3>
        <p>アイコンのキーの天面に、淡い凹みを描くかを選ぶ。選択はこのブラウザに保存する。</p>
        <fieldset className="seg is-two" data-icon-style-setting>
          <legend>アイコン</legend>
          {ICON_STYLE_OPTIONS.map((option) => (
            <label key={option.value} className={iconStyle === option.value ? "is-on" : ""}>
              <input
                type="radio"
                name="icon-style"
                value={option.value}
                checked={iconStyle === option.value}
                onChange={() => onIconStyle(option.value)}
              />
              <span className="seg-label">
                <Icon name="keymap" size="md" iconStyle={option.value} /> {option.label}
              </span>
            </label>
          ))}
        </fieldset>
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
