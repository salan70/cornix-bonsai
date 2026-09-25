# 改名前のデータは、読めるものは読み、置き場が変わるものは明示操作で移す

状態: 採用

2026-09-25に、ADR 0035の改名に合わせて旧形式の扱いを決めた。

## 背景

ADR 0035で識別子を`cornix-bonsai`・`cornix`から`keysync`へ改めた。
これまでのデータ形式を保つ前提が崩れ、改名前に作ったファイルや設定がそのままでは使えなくなる。

- `keymap.yaml`、`mac-keyboard.<layout>.yaml`、`labels.yaml`は先頭のschema IDが一致しないと読まない。
- `keymap.yaml`の`definition.path`は`cornix/definitions/<digest>.json`を指す。`readDefinitionBinding`はこれが`definitionPath(digest)`と完全一致することを要求するので、管理ディレクトリを`keysync/`にすると既存の`keymap.yaml`はすべて読めなくなる。
- Karabinerには名前が`Cornix Bonsai`のprofileが残っている可能性がある。
- ブラウザには、選んだdirectoryのhandle（IndexedDB）と表示の設定（localStorage）が旧名のキーで残る。
- `CORNIX_WORKSPACE`を設定している環境がありうる。

利用者は本人だけで、既存のworkspaceは1つである。
形式そのもの（行の並びと意味）は変えていない。

## 選択肢

schema ID:

1. 旧IDも読み、書き出しは新IDだけにする
2. 新IDだけを読み、旧IDのファイルは手で書き換えてもらう

管理ディレクトリ`cornix/`:

1. 旧形式を検出したら、利用者の明示操作で`keysync/`へ写し、`keymap.yaml`を書き直す
2. `keysync/`が無ければ`cornix/`を読む、という両方を読むフォールバックを置く
3. 起動時に黙って移す

Karabinerの旧profile:

1. 適用の計画で旧profileの存在を知らせ、削除を案内するだけにする
2. 旧profileを新しい名前へ置き換える
3. 旧profileを削除する

ブラウザの保存と環境変数:

1. 引き継がない
2. 旧キーと`CORNIX_WORKSPACE`も読む

## 決定

- **schema IDは案1。** 旧IDも読み、書き出しは新IDだけにする。開いただけでは書き換えず、編集して保存したときに新IDになる。形式は変えていないので版は`@1`・`@2`のまま据え置く。
- **管理ディレクトリは案1。** 移すのは`definitions/`、`labels.yaml`、`acknowledgements.json`だけで、生成物の`backups/`と`generated/`は移さない。順序はdigestの確認、`keysync/definitions/`への書き込み、labelsとacknowledgementsの複写、`keymap.yaml`の書き直しとする。旧`cornix/`は削除しない。入口はWeb UIの復旧カードとCLIの`keysync migrate`の2つにする。
- **Karabinerの旧profileは案1。** 情報の診断`mac-keymap/legacy-profile-present`を出し、Karabiner-Elementsで削除するよう案内する。置き換えも削除もしない。
- **ブラウザの保存と環境変数は案1。** directoryは1回選び直し、表示の設定は既定へ戻る。`CORNIX_WORKSPACE`は読まない。

## 理由

- **schema IDは読めない理由が無い。** 形式が同じなので、旧IDを受け付けても読み違えは起きない。書き出しを新IDだけにすれば、旧IDは保存のたびに減っていく。案2は利用者に意味の無い手作業を強いる。
- **両方を読むフォールバックは状態を曖昧にする。** 案2では、`keymap.yaml`が新しいpathを指すのに実体は旧ディレクトリにある、という状態が作れてしまう。どのファイルを見ているかが画面から分からなくなる。
- **ファイルの移動は明示操作にする。** 案3はGit管理のファイルを黙って増やす。既存の`legacy-binding`復旧（旧digestのbindingを移す操作）と同じく、何が起きるかを示してから利用者に押してもらう。
- **旧`cornix/`を消さない。** 移した結果を利用者が確かめてから消せるようにする。消すかどうかは利用者のGitの判断である。
- **旧profileには触らない。** KeySyncが所有するのは名前の一致するprofile 1個だけである（ADR 0022）。旧profileを置き換えたり消したりすると、所有していないprofileを書くことになる。この環境では旧profileは作られていないため、案内で十分である。
- **保存と環境変数は引き継ぐ価値が小さい。** 選び直しは1回で済む。旧環境変数を黙って読むと、ADR 0028が解いた「どこを見ているか分からない」問題が戻る。

## 影響

- 管理ディレクトリを移すまで、Web UIはCornix LPの編集を始めない。Mac側の設定は影響を受けない。
- 移行後も旧`cornix/`は残り、`.gitignore`は旧`cornix/`の生成物も除外し続ける。
- 旧profileを消すかどうかは利用者に委ねる。残すとKarabinerのprofile一覧に並び続ける。
- 旧IDを読むコードと移行の入口は、旧形式が残る限り維持する。

## Open Question

- 旧schema IDの読み込み、`cornix/`の移行、旧profileの案内をいつ取り除くか。手元の旧形式がなくなった時点が候補である。
