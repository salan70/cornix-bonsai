// D-004 Spike: 実機も browser も要らない検証。
// 実行: nix develop -c node spikes/d-004-workspace/self-check.mjs

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LAYOUT,
  backupPath,
  checkPairing,
  definitionDigest,
  definitionPath,
  isTracked,
  pairingHeader,
} from "./workspace.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");

const problems = [];
const check = (ok, msg) => {
  console.log(`${ok ? "OK  " : "NG  "} ${msg}`);
  if (!ok) problems.push(msg);
};

console.log("== workspace の配置 ==");
console.log(JSON.stringify(LAYOUT, null, 2));

// .gitignore が既に無視している範囲と、生成物の範囲が一致しているか。
const gitignore = await readFile(resolve(repo, ".gitignore"), "utf8");
check(gitignore.includes(`${LAYOUT.backups}/`), `.gitignore が ${LAYOUT.backups}/ を無視している`);
check(
  gitignore.includes(`${LAYOUT.generated}/`),
  `.gitignore が ${LAYOUT.generated}/ を無視している`,
);
check(!gitignore.includes(`${LAYOUT.definitions}/`), `definition は Git 管理対象（無視しない）`);

check(isTracked(LAYOUT.keymap), "keymap.yaml は Git 管理");
check(isTracked(`${LAYOUT.definitions}/abc.json`), "definition は Git 管理");
check(!isTracked(`${LAYOUT.backups}/x.json`), "backup は Git 管理外");
check(!isTracked(`${LAYOUT.generated}/x.svg`), "生成物は Git 管理外");

console.log("\n== definition の content-addressing ==");
const definitionBytes = await readFile(
  resolve(repo, "fixtures/cornix-lp/vial-definition-v1.12.json"),
);
const digest = await definitionDigest(definitionBytes);
const definition = JSON.parse(definitionBytes.toString("utf8"));
console.log(`digest = ${digest}`);
console.log(`path   = ${definitionPath(digest)}`);

check((await definitionDigest(definitionBytes)) === digest, "同じ内容なら同じ digest");
const mutated = Buffer.from(definitionBytes);
mutated[mutated.length - 2] = mutated[mutated.length - 2] === 32 ? 10 : 32;
check((await definitionDigest(mutated)) !== digest, "1 byte 違えば別の digest");

console.log("\n== keymap ↔ definition の対応づけ ==");
const header = pairingHeader({
  keyboardUid: "16882930253541522617",
  digest,
  definitionName: definition.name,
});
console.log(JSON.stringify(header, null, 2));

check(checkPairing(header, digest, "16882930253541522617").length === 0, "一致する組は問題なし");
check(checkPairing(header, "deadbeef", "16882930253541522617").length === 1, "digest 不一致を検出");
check(checkPairing(header, digest, "1").length === 1, "keyboard uid 不一致を検出");

console.log("\n== backup の命名 ==");
const first = backupPath(new Date("2026-08-19T01:02:03.456Z"));
const second = backupPath(new Date("2026-08-19T01:02:04.000Z"));
console.log(first);
console.log(second);
check(first < second, "辞書順と時刻順が一致する");
check(!first.includes(":"), "Windows で使えない文字を含まない");

console.log("\n== xz decoder の要否 ==");
// definition は実機から xz 圧縮で届く（ADR 0003）。browser にも Node にも
// xz の組み込み実装は無い。DecompressionStream は gzip / deflate / deflate-raw のみ。
const supported = ["gzip", "deflate", "deflate-raw"];
let xzSupported = false;
try {
  new DecompressionStream("xz");
  xzSupported = true;
} catch {
  xzSupported = false;
}
console.log(`DecompressionStream が扱える形式: ${supported.join(", ")}`);
check(!xzSupported, "xz は DecompressionStream で扱えない（decoder の追加が要る）");
// これは browser-only 案と local service 案の差にならない。Node にも xz は無い。

console.log(problems.length === 0 ? "\n全チェック通過" : `\n未解決 ${problems.length} 件`);
process.exit(problems.length === 0 ? 0 : 1);
