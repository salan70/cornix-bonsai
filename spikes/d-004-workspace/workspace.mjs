// D-004 Spike: workspace の配置規則と、keymap ↔ keyboard definition の対応づけ。
// 使い捨てコードです。本実装ではありません。
// 判断の結果は docs/decisions/0007-workspace-layout.md にあります。
//
// browser と Node の両方から import する。browser 側は index.html が使う。

/**
 * workspace の配置。
 *
 * .gitignore が既に cornix/generated/ と cornix/backups/ を無視しているため、
 * Git 管理対象と生成物の線はそこに合わせる。
 */
export const LAYOUT = {
  keymap: "keymap.yaml",
  definitions: "cornix/definitions",
  backups: "cornix/backups",
  generated: "cornix/generated",
};

/** Git 管理する path か。backups と generated は生成物なので管理しない。 */
export function isTracked(path) {
  return !path.startsWith(LAYOUT.backups) && !path.startsWith(LAYOUT.generated);
}

/**
 * definition の内容から digest を出す。
 *
 * definition は content-addressed で置く。ファイル名が内容から決まるので、
 * 「どの definition で解釈したか」を keymap.yaml から digest 1 個で指せる。
 * 実機由来と firmware 由来で同じ内容なら同じ file になり、二重に持たない。
 */
export async function definitionDigest(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** digest から definition の置き場所を決める。 */
export function definitionPath(digest) {
  return `${LAYOUT.definitions}/${digest.slice(0, 16)}.json`;
}

/**
 * backup の置き場所。Apply ごとに 1 file。
 *
 * 名前は時刻から決める。ISO8601 の `:` は Windows のファイル名に使えないため落とす。
 * 辞書順と時刻順を一致させたいので、区切りを削るだけにして桁は詰めない。
 */
export function backupPath(date) {
  const stamp = date.toISOString().replace(/[:.]/g, "").replace("Z", "Z");
  return `${LAYOUT.backups}/${stamp}.json`;
}

/**
 * keymap.yaml の先頭に置く対応づけ。
 *
 * ADR 0002 の「どの definition で解釈したか記録する」の実体。
 * uid は実機の id（64bit なので文字列）。digest は definition の内容。
 */
export function pairingHeader({ keyboardUid, digest, definitionName }) {
  return {
    keyboard: { uid: keyboardUid, name: definitionName },
    definition: definitionPath(digest),
    definitionDigest: digest,
  };
}

/**
 * keymap と definition の組が食い違っていないか。
 *
 * 食い違いの検出は D-003 の severity model の対象だが、workspace が対応づけを
 * 持てているかはここで確認できる。
 */
export function checkPairing(header, actualDigest, actualUid) {
  const problems = [];
  if (header.definitionDigest !== actualDigest) {
    problems.push(`definition digest 不一致: 記録=${header.definitionDigest} 実物=${actualDigest}`);
  }
  if (actualUid !== undefined && header.keyboard.uid !== actualUid) {
    problems.push(`keyboard uid 不一致: 記録=${header.keyboard.uid} 実機=${actualUid}`);
  }
  return problems;
}
