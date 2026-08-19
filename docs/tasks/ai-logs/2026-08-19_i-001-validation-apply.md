# I-001 validation gateをSafe Applyへ型で接続する

## Fact

- 既存の`createApplyPlan`は`DeviceSnapshot`、desired、targetsだけを受け取り、validation
  gateを呼び出し側の規約に任せていた。
- `createApplyPlan`はdesiredに存在するがbackupに無いtargetをsilent skipしていた。
- `ApplyGate`はdiagnostic severityとacknowledgeを判定していたが、Apply planの型には接続
  していなかった。
- 実装前の固定Nix環境ではtypecheck、80 tests、DocBridge checkが成功していた。

## Decision

- `assertApplyAllowed`は通過済みを表すbranded `ApplyAllowedValidation`を返す。
- `createValidatedApplyInput`でgate、keyboard UID、definition binding、実機申告容量、
  supported qsid、full-read backup、desired、write targetを束ねる。
- `createApplyPlan`は`ValidatedApplyInput`だけを受け取り、coverage不足をprecondition errorに
  する。
- planは全入力から決定的なfingerprintを作り、`confirmApply`の必須引数で確認済みdiffとの
  同一性を検証する。
- acknowledge IDのworkspace保存・復元はIssue #11の範囲外として変更しない。

## Review follow-up

- Reviewで、allowed gateだけではvalidation対象とdesiredの同一性を証明できず、古いgateと
  新しいcontext / desiredを組み合わせられる指摘を受けた。
- `ValidationEvidence`を`validateKeymap`から返せる形にし、gateはevidence付きでだけApplyへ
  渡せるようにした。
- `createValidatedApplyInput`はevidenceのdesired fingerprintとApply対象を再照合する。
  definitionやdevice contextは独立引数を廃止し、別evidenceによるrollbackもcontext一致を
  必須にした。
- desired変更、acknowledged warningの流用、definition digest変更の回帰テストを追加した。

## Verification

- `nix develop -c just typecheck`
- `nix develop -c just test`（89 tests passed）
- `nix develop -c just docbridge-check`

## Open Question

- fingerprintの表示形式・永続化はUI / workspace実装時に決める。coreでは決定的な比較値として
  扱い、暗号用途には使わない。
