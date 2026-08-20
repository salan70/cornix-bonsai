# UIをADR 0011のwireframe artifactへ寄せる

## 対象

ADR 0011が参照する5つのwireframe artboard（Main、Diagnostics、ApplyDiff、ApplyProgress、Overview）へ、
既存UIの見た目と情報構造を寄せた。

## 実施内容

- artifactのoklch design token、system dark mode、chrome / keyboard / panel / diagnostics / modalのCSS体系を導入した。
- `main.tsx`を責務別componentへ分割し、header、status、keymap、編集panel、診断panel、Overview、Behaviors、References、Apply、workspace recoveryを分離した。
- keycapの座標倍率をartifactに揃え、keycodeの意味別配色、主ラベル・役割ラベル、encoder帯、layer chip、side panelのTap/Hold selectとraw入力を実装した。
- status barのseverity件数から診断panelを開けるようにし、診断の集約表示、対象へのジャンプ、盤面の警告縁取り、Escによる復帰を実装した。
- Apply modalをbackup、差分確認、確認、書き込み、結果の5 stepへ拡張し、full read / write-and-verifyの実測往復回数、operationごとの進捗、acknowledge checkbox、永続化未確認の注意を表示した。
- Overviewを10 layerの4列mini board gridへ置き換え、未使用・到達不能表示とdisabledのSVG/PDF export導線を配置した。
- `docs/specs/ui.md`へcomponentごとのUI仕様を追記し、DocBridgeで検証可能なTS entrypointへ双方向リンクを追加した。

## 制約と判断

DocBridge 0.8.0はTypeScript scannerでTSXを解析できるが、`include.code.typescript.patterns`のglobを`.ts`終端に限定している。
そのため、実装本体のTSXへ直接設定を広げず、`src/ui/components/index.ts`にcomponent export endpointを置いて仕様リンクを検証対象へ接続した。
実機接続、実機read、Apply、firmware操作は行っていない。

## 検証

- `nix develop -c just test`: 129 tests passed
- `nix develop -c pnpm typecheck`: passed
- `nix develop -c just docbridge-check`: 0 errors / 0 warnings
- `nix develop -c pnpm dev -- --host 127.0.0.1`: localhost初期画面をブラウザで確認し、header、4 tab、empty state、status barのDOMを確認
- `Workspaceを開く`はブラウザのFile System Access APIが自動インターセプトされるため、fixture読み込み後の画面確認は未実施
