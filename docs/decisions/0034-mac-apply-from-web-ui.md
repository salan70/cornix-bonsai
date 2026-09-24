# Macの設定はWeb UIからローカルサーバー経由で適用する

状態: 採用

## 背景

2026-09-24に、Mac内蔵キーボードの設定を変える手順を見直した。
編集の中心はWeb UIだが、適用はCLIだけが行う（ADR 0022）。
利用者はWeb UIで編集し、ターミナルで`just mac apply`を実行し、表示されたfingerprintを
コピーして`just mac apply --confirm <fingerprint>`をもう一度実行していた。

ADR 0022がWeb UIから適用しないと決めた理由は2つある。

- Webページが他のアプリのglobal config（`karabiner.json`）を書き換えるのは責務が壊れる
- `karabiner_cli`によるlintとverifyはNodeからしか呼べない

ADR 0033でWeb UIは`just ui`が起動するローカルNodeサーバーから配るようになった。
Nodeの処理を同じ起動に置けるので、どちらの理由も「Web UIからは書かない」ことを要求しなくなった。

## 選択肢

1. ローカルサーバーに適用APIを置き、Web UIから差分確認と適用を行う
2. `just mac apply`を対話式（差分を出して`[y/N]`で確認）にし、適用はターミナルに残す
3. Web UIのボタンからURL schemeでターミナルを開き、コマンドを実行する

## 決定

案1を採る。CLIの`--confirm`はそのまま残し、対話式（案2）は作らない。

- **適用APIは`apply-service.ts`を通る。** 手順（read → validate → 生成とlint → diffと
  fingerprint → backup → atomic置換 → verify → profile選択）はCLIと共通にする
- **ディスク上のyamlを正とする。** Web UIは編集中のdocumentの`macKeymapDigest`を送り、
  サーバーはディスクから読んだ設定のdigestと比べる。一致しなければ止め、絶対pathを示す
- **編集対象の配列がこのマシンの内蔵配列と一致するときだけ適用できる。** サーバーは
  `detectBuiltInLayout`の結果をWeb UIへ伝え、Web UIは適用できる対象に「この Mac」と印を付ける
- **APIの防御はヘッダーで行い、トークンは持たない。** `127.0.0.1`へのbindに加え、POSTと
  `application/json`だけを受け、`Host`・`Origin`・`Sec-Fetch-Site`を確認する
- **差分は押したときだけ計算する。** status barに未適用の件数を常に出す仕組みは作らない
- **Karabinerが入っていなければ計画の段階で止める。** CLIはlintを保留して進むが、APIは止める
- **profileの切り替えだけが失敗したら、書き込みは巻き戻さない。** 切り替えだけをやり直す
  入口を出す

## 理由

- **案1は手順が最も短い。** `just ui`の後はブラウザで`適用`を押すだけで、人が差分を見て
  承認する点は変わらない。案2はターミナルとの行き来が残る。案3はNixの外にmacOSアプリを
  入れ、アクセシビリティ権限かターミナルの起動待ちを抱える
- **fingerprintをそのまま使える。** 計画を組むプロセスと承認するプロセスが分かれる、という
  fingerprintの前提に合う。Web UIは表示した計画のfingerprintを送り返すだけである
- **ディスクを正とする。** Web UIの中身をサーバーへ送って適用すると、Git管理のyamlと
  適用した設定が一致する保証が消える。File System Accessで開いたフォルダの絶対pathは
  ブラウザから分からないので、同じファイルを見ているかはdigestで確かめる。正規形のdigestに
  するのは、手で書いたコメントで誤って止めないためである
- **配列の不一致を止める。** 別配列の設定を書くと、物理的に存在しないキーの規則が並び、
  何も起こさない死に規則になる（ADR 0027と同じ理由）
- **トークンは防ぐ相手に対して余分である。** 守るのはブラウザで開いている別のサイトで、
  CSRFは`Origin`と`Sec-Fetch-Site`で、DNS rebindingは`Host`で防げる。トークンが追加で防ぐのは
  同じユーザーの別プロセスだけで、それは`karabiner.json`を直接書ける。対象ブラウザが
  Chromium系だけなので（ADR 0004）、`Sec-Fetch-Site`を前提にできる
- **常時表示は後から足せる。** 押すたびに計画を組めば、起動から適用までは成り立つ。
  常時表示は計画のたびに`cornix/generated/`を書き（ADR 0028）、保存のたびにlintを走らせる。
  書かずに差分だけを出す経路は今は他に使い道が無い
- **Karabinerが無ければ止める。** Web UIの適用は書き込みから切り替えまでが1つの操作で、
  Karabinerが無いと必ず途中で失敗する
- **巻き戻さない。** 書き込みとverifyは通っている。巻き戻しはもう一度の書き込みで、新しい
  失敗の原因を増やす

## 影響

- ADR 0022の「適用はCLIのみ」を本ADRで改訂する。Cornixが所有するのはprofile 1個だけ、
  `global`と他profileに触らない、diffとverifyは構造で行う、という決定は変えない
- ADR 0025の「適用はCLI専用」「Browser UIは内蔵配列を検出しない」を本ADRで改訂する。
  配列の検出はサーバーが行い、Web UIは結果を受け取るだけである
- ADR 0028のOpen Question（`--select-profile`の失敗時に巻き戻すか）へ「巻き戻さず、切り替え
  だけをやり直す」と答える
- Web UIの適用には`just ui`で起動したサーバーが要る。`just dev`で開いたときはサーバーへ
  届かないと表示する
- Web UIで開いたフォルダがサーバーの読むリポジトリと違うと、digestが一致せず適用できない
- 同じマシンの別プロセスは、ヘッダーを偽ってAPIを呼べる。そのプロセスは既に
  `karabiner.json`を直接書けるため、新しい危険は増えない
- status barの「Karabiner asset を書き出す」は実機パネルだけに残す
