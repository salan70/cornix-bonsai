# 製品名をKeySyncにし、識別子もすべて改める

状態: 採用

2026-09-25に、利用者の決定を受けて記録した。

## 背景

Cornix BonsaiはCornix LP専用のキーマップ編集ツールとして始まった。
その後、MacBook内蔵キーボード（ADR 0022）とMagic Keyboard（ADR 0026）を扱うようになった。
今後も利用者や友人が買った機種を足していく。
製品名に機種名が入っていると、Cornix LP以外を扱う理由が名前から読めない。
加えて、コード上の「Cornix」が製品を指すのか機種を指すのかが文脈に頼っていた。

目的は「複数のキーボードのキーマップを1か所で管理し、実機とOSへ同期する」ことである。
名前はこの目的を表し、機種に縛られないものにする。

## 選択肢

1. 表示名と識別子（package、CLI、schema ID、Karabiner profile、workspace dir、保存キー、環境変数）をすべてKeySyncへ改める
2. 表示名だけをKeySyncにし、識別子は`cornix-bonsai`のまま残す
3. 名前を変えず、Cornix Bonsaiのまま機種を足す
4. 識別子は改めるが、Karabinerの変数名`cornix_layer_N`だけは残す

## 決定

案1を採る。
表示名は`KeySync`、識別子は`keysync`とする。

| 対象                              | 旧                                                   | 新                                             |
| --------------------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| 表示名                            | Cornix Bonsai                                        | KeySync                                        |
| package、repository、ディレクトリ | `cornix-bonsai`                                      | `keysync`                                      |
| CLI                               | `cornix`（`just cornix`）                            | `keysync`（`just keysync`）                    |
| schema ID                         | `cornix-bonsai/keymap@1`、`mac-keymap@1`、`labels@2` | `keysync/keymap@1`、`mac-keymap@1`、`labels@2` |
| Karabiner profileの既定名         | `Cornix Bonsai`                                      | `KeySync`                                      |
| Karabinerの変数                   | `cornix_layer_N`                                     | `keysync_layer_N`                              |
| profileを生成する関数             | `generateCornixProfile`                              | `generateOwnedProfile`                         |
| workspaceの管理ディレクトリ       | `cornix/`                                            | `keysync/`                                     |
| IndexedDB、localStorage           | `cornix-bonsai`、`cornix-bonsai.*`                   | `keysync`、`keysync.*`                         |
| 環境変数                          | `CORNIX_WORKSPACE`                                   | `KEYSYNC_WORKSPACE`                            |

機種を指す識別子（`isCornix`、`CornixBoard`、`kind: "cornix"`、`fixtures/cornix-lp/`、`CORNIX_LP_V112_SETTINGS`、「Cornix LP」）は変えない。
これらは製品ではなく機種を指しており、改名後はかえって意味がはっきりする。
関数名には製品名を入れず、役割（所有するprofileを作る）で名付ける。
旧形式の読み込みと移行はADR 0036で決める。

## 理由

- **識別子にも製品名が残ると、改名の目的が半分しか果たせない。** 案2では`cornix/`や`cornix-bonsai/keymap@1`が機種の名前に見え、Mac用の設定にCornixの名が付く状態が続く。
- **案3は機種を足すたびに名前との食い違いが大きくなる。**
- **`cornix_layer_N`を残す理由が無い。** 変数は適用のたびに所有profileごと全再生成されるため、改めても利用者の作業は増えない。残すと、Karabinerの画面で製品名と変数名が食い違う（案4を却下）。
- **識別子を改めるとデータ形式の互換が崩れる。** 保存済みのファイルがそのままでは読めなくなるので、データ形式の仕様変更として扱い、旧形式の扱いをADR 0036で明示する。

## 影響

- ADR 0022の「所有するのはnameが`Cornix Bonsai`のprofile 1個だけ」を、既定名`KeySync`へ改訂する。所有するのが名前の一致するprofile 1個だけであることは変えない。
- 旧名のprofileがMacに残っていても、KeySyncは置き換えも削除もしない。扱いはADR 0036で決める。
- GitHubのrepositoryは`salan70/keysync`へ改名済みで、旧URLはGitHubのredirectで届く。
- ADR 0001〜0034、既存の作業ログ、Spikeは当時の名前のまま残す。
