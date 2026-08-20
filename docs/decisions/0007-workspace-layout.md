# workspaceはBrowser標準APIだけで閉じ、definitionはcontent-addressingでkeymapと対応づける

状態: 採用

2026-08-19に、配置規則とdefinitionの対応づけをSpike（`spikes/d-004-workspace/`）で検証した。
同日、Chromium系browserの手動確認でFile System Access APIの権限復帰と外部編集の取り込みを確認した。

## 背景

Browserとworkspaceの間にlocal serviceが要るかを判断する。
`keymap.yaml`、Git向けのstate、backup、AIエージェントによる編集を何が調整するかが論点。

ADRから持ち越された要求は以下。

- workspaceにdefinitionの置き場と、keymapとの対応づけが要る（ADR 0002）
- どのdefinitionでkeymapを解釈したかを識別できるようにする（ADR 0002）
- definitionはxz圧縮されて届くため、decoderが要る（ADR 0003）
- backup JSONはApplyごとに保存し、UIから復元できる導線を持つ。置き場所はここで決める（ADR 0005）

Spikeで確認できた事実。

- `.gitignore`が既に`cornix/generated/`と`cornix/backups/`を無視している。
  Git管理対象と生成物の線は最初から引かれていた
- `DecompressionStream`が扱えるのは`gzip` / `deflate` / `deflate-raw`のみで、**xzは扱えない**。
  これはNodeでも同じで、**xz decoderの追加は browser-only案とlocal service案の差にならない**
- ADR 0004 でWebHIDを採用した時点で対象browserはChromium系に確定している。
  `showDirectoryPicker`も同じ制約下にあるため、browser-only案の追加コストはゼロ

## 選択肢

1. Browser標準API（File System Access API）だけでworkspaceを扱い、local serviceを置かない
2. local Node serviceを置き、filesystem・file watching・workspace APIをそこへ寄せる
3. workspaceを持たず、`.vil`のimport / exportとdownloadだけで完結させる

## 決定

案1を採る。

- workspaceはユーザーが選んだ1つのディレクトリとし、Git作業ツリーをそのまま使う
- 配置は以下。`.gitignore`の既存の線に合わせる

  ```text
  <workspace>/
    keymap.yaml               # desired state。Git管理
    cornix/
      definitions/<digest>.json  # Git管理
      backups/<時刻>.json        # Git管理外
      generated/                 # Git管理外
  ```

- **definitionはcontent-addressingで置く**。内容のSHA-256をファイル名にする。
  `keymap.yaml`は先頭でそのdigestを指し、「どのdefinitionで解釈したか」をdigest 1個で表す
- **digestの対象はcanonical表現とする**。JSONとして読んでキーを辞書順へ揃え、2 space整形
  - 末尾改行へ直したbytesをSHA-256する。workspaceへもこの表現で書く
- backupはApplyごとに1 file。名前は時刻から決め、辞書順と時刻順を一致させる。
  `:`はWindowsのファイル名に使えないため落とす
- **local serviceに持たせない責務**: filesystem、file watching、実機I/O、workspace API。
  つまりlocal serviceを置かない
- xz decoderはbrowser/Nodeで動く`xz-decompress`を採用し、WebHID adapterからprotocolへ注入する

## 理由

- 案2の主な動機はfile watchingとworkspace APIだが、どちらもlocal serviceを常駐させる
  代償に見合わない。ユーザーが明示的に再読み込みする導線で足りる。
  常駐processは配布物とライフサイクル管理を増やし、「ローカルファースト」の利点を薄める
- xz decoderは案1と案2の判断材料にならない。Nodeにもxzの組み込み実装が無いため、
  どちらを選んでもdecoderは追加する
- WebHIDの時点でChromium系に絞られている以上、File System Access APIの非対応を
  理由に案2を選ぶ根拠が無い
- 案3はGit管理するdesired stateという前提（README）を満たさない。
  AIエージェントが設定を編集する導線も無くなる
- content-addressingを採るのは、実機由来とfirmware由来で同じ内容のdefinitionを
  二重に持たないため。加えて、digestが変わればkeymapとdefinitionの組の食い違いを
  そのまま検出できる。versionや取得元を名前に使うと、同じ名前で中身が違う事故が起きる
- digestをcanonical表現に対して取るのは、definitionが「Git管理されたworkspaceのファイル」と
  「実機がxzで配るpayload」の2経路から来るため。raw bytesを対象にすると、同じ内容でも
  整形が1 byte違うだけで別digestになり、実機を繋いだ瞬間にdefinition mismatchでApplyが
  止まる。整形の違いを同一視しても「中身が違えば別digest」という性質は失われない

## 影響

- File System Access APIの権限は、Chromium系browserでの手動確認によりリロード後も復帰することを確認した
- browserからGit操作は行わない。commitとpushはユーザーまたはAIエージェントがCLIで行う
- file watchingを持たないため、外部の変更は明示的な再読み込みで取り込む。
  編集の衝突検出は別途必要になる（未検討）
- backupのファイル名は時刻由来のため、同一ミリ秒に2回Applyすると衝突する。
  実際のApplyは全readを伴い数秒かかるため現実には起きないが、前提として記録しておく
- definitionのdigestはファイル名に先頭16文字だけ使う。衝突確率は無視できるが、
  `keymap.yaml`には全長を記録して照合に使う

## 手動確認結果

```bash
nix develop -c node spikes/d-004-workspace/serve.mjs
# http://localhost:8177/d-004-workspace/index.html を Chromium 系 browser で開き、
# 手順 1 → 2 → リロード → 手順 3 の順に押す
```

- 手順1でworkspace `test`を選択し、手順2でworkspace構造を作成した
- ページをリロードした後、手順3でリロード直後の権限が`granted`となり、ディレクトリを再選択せず`keymap.yaml`を読み書きできた
- 手順4で外部から`keymap.yaml`を変更し、再読み込み後に変更内容が表示された
- 検証用workspaceの生成物は確認後に削除した
- 今回は実機接続、WebHID、firmware writeを行っていない
