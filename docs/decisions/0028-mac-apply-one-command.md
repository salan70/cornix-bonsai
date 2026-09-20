# mac applyはprofile選択まで行い、workspaceはこのリポジトリを既定にする

状態: 採用

2026-09-20に、MacBook内蔵キーボードの設定を実運用へ載せようとして、反映までの手数と
「applyは成功したのに何も効かない」経路が見つかったことへの対応を決めた。

## 背景

反映までに5手あった。`mac generate` → `mac diff` → `mac apply`（fingerprint表示）→
`mac apply --confirm` → `karabiner_cli --select-profile`である。`just cornix`はリポジトリの
rootから走るため、すべてに`--workspace`を書く必要もあった。desired stateの置き場所も
決まっていない。

手数より重いのは次の欠陥である。**初回applyは成功しても何も起きない。**
`planMacApply`の`mac-keymap/profile-not-selected`は`before !== undefined && before.selected !== true`
で判定しており、profileを新規追加する初回は`before === undefined`なので無診断で通る。
profileを選択しない限り設定は効かないので、利用者は「applyは通ったのに効かない」に
必ず一度は当たる。警告が最も要る場面でだけ警告が出ない。

## 選択肢

1. profile選択をCLIが行い、既定workspaceをリポジトリに固定する
2. 手順はそのままで、初回の警告漏れだけ直す
3. `karabiner.json`の`selected`をCornixが直接書く

## 決定

案1を採る。日常操作を2コマンドにする。

```bash
just mac apply                          # generate + lint + 構造diff + fingerprint
just mac apply --confirm v1-xxxx-yyyy   # backup → write → verify → profile選択 → 読み戻し
```

あわせて以下を決めた。

- **選択は`karabiner_cli --select-profile`で行う。** `karabiner.json`の`selected`は
  書かない。ADR 0022の「Cornixが書くのは所有profile 1個だけ」は変えない。改訂するのは
  「profileの切り替えはユーザーの操作」という担当の線だけである
- **選択はverifyの後に置く。** `--select-profile`はKarabiner自身に`karabiner.json`を
  書かせるため、verifyより前に置くと、verifyが自分で動かした後のファイルを見る
- **選択できたことを`--show-current-profile-name`で読み戻す。** 食い違えば非0で終わる。
  writeのverifyと同じ姿勢で、「命令を出した」ではなく「そうなった」を成功の条件にする
- **判定は「適用後に所有profileが有効なprofileになっているか」。** profileが既存かどうかとは
  独立に決める。`selected === true`のprofileが所有profileでなければ選択が要る
- **診断は選択の有無で分ける。** 既定（選択する）は`mac-keymap/profile-will-be-selected`
  （information）、`--no-select`は`mac-keymap/profile-not-selected`（warning）
- **`--no-select`はfingerprintを変える。** 診断idは指紋に入るため必然だが、これは望ましい。
  確認文字列を`cornix mac apply --no-select --confirm <fp>`の形で返し、フラグを取り違えた
  確認が黙って別の計画を通さないようにする
- **lintは書き込み前のゲートへ移す。** 計画フェーズと確認フェーズの両方でassetを生成して
  lintし、落ちたら`karabiner.json`へ触らない。Karabinerが入っていなければlintは`undefined`に
  なり、判定を保留して素通しする
- **`mac`の既定workspaceはこのリポジトリ。** 優先順は`--workspace` > `$CORNIX_WORKSPACE` >
  リポジトリroot。`mac`以外のcommandは従来どおりcwdのまま
- **`mac`の全出力へ解決済みの`workspace`を載せる。** 既定が暗黙に効くので、どこを見ているかは
  実行したコマンド自身が答える
- **`karabiner_cli`はinterface（`KarabinerCli`）越しに呼ぶ。** testは偽物を注入する。
  `KARABINER_CLI`は絶対パス固定のままで、PATH探索もenv overrideも足さない

## 理由

- **案2は手数を残す。** 痛点は警告漏れと手数の両方で、片方だけ直しても運用は軽くならない
- **案3は動いているKarabinerと食い違う。** Karabinerは自身のUIとCLIから`selected`を
  管理しており、Cornixが直接書くと実行中のプロセスの状態と競合する。`karabiner_cli`に
  選ばせれば、Cornixが書く範囲は所有profile 1個のまま変わらない
- **ADR 0022と衝突しない。** あのADRの「`selected`は変更しない」は**Cornixが
  `karabiner.json`へ何を書くか**の話である。`replaceOwnedProfile`が`selected`を出さない
  不変条件はそのまま残り、testも変えていない
- **desired stateをこのリポジトリへ置く**のは、Mac側の設定が`keymap.yaml`と違って
  実機definitionにもworkspace固有の生成物にも結びつかず、利用者が別ディレクトリを
  用意する理由が無いため。置き場所が決まっていないこと自体が運用の負担だった
- **cwdへ倒さない。** いま`just cornix`がリポジトリrootで走るのはjustfileの副作用であり、
  これに依存すると「どこを見ているか分からない」という元の問題がそのまま残る
- **lintを書き込み前にする。** ADR 0022の手順はlintを最後に置いていたが、落ちたときに
  既に書き込み済みでは意味が薄い。ゲートとして使うほうが「壊れた設定を置かない」に近い

## 影響

- ADR 0022の「profileの切り替えはユーザーの操作」と、Applyフローの手順の並びを本ADRで
  改訂する。ほかの決定（所有profileは1個、`global`と他profileに触らない、diffとverifyは
  構造で行う、Browser UIからは適用しない）は変えない
- `mac apply`は計画フェーズでも`cornix/generated/`を書く。`karabiner.json`へは
  書かない点は変わらない。errorのあるdesired stateは生成の手前で弾くので、
  `cornix/`が作られないことも変わらない
- **`disable_built_in_keyboard_if_exists`は引き継がない。** 現行`Default profile`が持つ
  vendor 1278 / product 33 の設定は、所有profileへ切り替えた時点で効かなくなる。
  不要と判断したため機構を作らない。必要になったらprofile単位のdevice設定として別途
  ADRを起こす。自動選択によってこの喪失がKarabiner UIを開かずに起きる点は、
  切り替えを自動化したことの代償である
- **`caps_lock`はSpike R-007が終わるまで`mac-keyboard.*.yaml`へ書かない。** dotfilesが
  `com.apple.keyboard.modifiermapping.0-0-0`でCaps Lock → 右Controlを全キーボードへ
  かけており、Karabinerの`from`に届くのが`caps_lock`か`right_control`かを実測していない。
  コードでは禁止しない。将来の仮想要件に対する作り込みになるため

## Open Question

- `--select-profile`が失敗した場合、`karabiner.json`は既に書き換わっている。現状は非0で
  終わって利用者へ知らせるだけで、write自体は巻き戻さない。巻き戻しが要るかは
  実運用で判断する
- fingerprintは`karabiner.json`の現在値を含まない。計画と確認の間に他所から
  `karabiner.json`が書き換わっても検出しない。これはADR 0022の時点からの性質で、
  本ADRでは変えていない
