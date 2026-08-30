/**
 * R-006 Spike の自動検証。MacBook 実機は要らない。
 *
 *   nix develop -c node spikes/r-006-macos-keyboard/self-check.mjs
 *
 * 確かめること:
 *
 * 1. layer（MO / LT / TG）と tap-hold が manipulator へ落ちる
 * 2. `KC_TRNS` と layer 0 と同値のキーは manipulator を出さない
 * 3. 落とせない keycode は黙って消えず diagnostic になる
 * 4. 出力が `karabiner_cli --lint-complex-modifications` を通る
 * 5. `karabiner_cli --format-json` の整形が `JSON.stringify` と一致しない
 *    （= diff / verify をテキストで行えないことの実証）
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateAsset, generateProfile, resolveKeycode } from "./generate.mjs";

const KARABINER_CLI = "/Library/Application Support/org.pqrs/Karabiner-Elements/bin/karabiner_cli";

/**
 * MacBook 内蔵キーボード（JIS）を想定した最小の desired state。
 *
 * 位置は Karabiner の `key_code` 名で、値は QMK 表記（ADR 0022）。matrix の row / col は無い。
 * 書かれていないキーは素通しなので、全キーを並べる必要がない。
 */
const DESIRED = {
  schema: "cornix-bonsai/mac-keymap@1",
  profile: "Cornix Bonsai",
  layers: [
    {
      // layer 0: 単押し Esc / 長押し Ctrl、かなキーで layer 1、英数キーで layer 2
      caps_lock: "LCTL_T(KC_ESC)",
      japanese_kana: "LT1(KC_LANG1)",
      japanese_eisuu: "MO(2)",
      right_command: "TG(3)",
    },
    {
      // layer 1: カーソル移動
      h: "KC_LEFT",
      j: "KC_DOWN",
      k: "KC_UP",
      l: "KC_RGHT",
      a: "KC_HOME",
      e: "KC_END",
      d: "KC_DEL",
    },
    {
      // layer 2: function key と無効化
      1: "KC_F1",
      2: "KC_F2",
      q: "KC_NO",
      w: "KC_TRNS",
      caps_lock: "LCTL_T(KC_ESC)",
    },
    {
      // layer 3: TG で切り替わる。テンキー相当
      u: "KC_7",
      i: "KC_8",
      o: "KC_9",
    },
  ],
};

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail === "" ? "" : ` — ${detail}`}`);
  }
}

console.log("1. keycode の解決");
check("LCTL_T(KC_ESC) が modTap", resolveKeycode("LCTL_T(KC_ESC)").kind === "modTap");
check("LT1(KC_LANG1) が layerTap", resolveKeycode("LT1(KC_LANG1)").kind === "layerTap");
check("MO(2) が layerMomentary", resolveKeycode("MO(2)").kind === "layerMomentary");
check("TG(3) が layerToggle", resolveKeycode("TG(3)").kind === "layerToggle");
check("KC_TRNS が transparent", resolveKeycode("KC_TRNS").kind === "transparent");
check("KC_NO が none", resolveKeycode("KC_NO").kind === "none");
check("未対応 keycode が unsupported", resolveKeycode("TD(0)").kind === "unsupported");

console.log("2. rules の生成");
const { asset, diagnostics } = generateAsset(DESIRED);
check("diagnostic が 0 件", diagnostics.length === 0, JSON.stringify(diagnostics));

const all = asset.rules.flatMap((rule) => rule.manipulators);
const byKey = (keyCode) => all.filter((m) => m.from.key_code === keyCode);

check(
  "rule が layer 降順",
  asset.rules.map((r) => r.description).join() ===
    "Cornix Bonsai layer 3,Cornix Bonsai layer 2,Cornix Bonsai layer 1,Cornix Bonsai layer 0",
);
check(
  "MO(2) が set_variable と to_after_key_up を持つ",
  byKey("japanese_eisuu")[0]?.to?.[0]?.set_variable?.value === 1 &&
    byKey("japanese_eisuu")[0]?.to_after_key_up?.[0]?.set_variable?.value === 0,
);
check(
  "LT1 が to_if_alone を持つ",
  byKey("japanese_kana")[0]?.to_if_alone?.[0]?.key_code === "japanese_kana",
);
check(
  "mod-tap が lazy な modifier と to_if_alone を持つ",
  byKey("caps_lock")[0]?.to?.[0]?.key_code === "left_control" &&
    byKey("caps_lock")[0]?.to?.[0]?.lazy === true &&
    byKey("caps_lock")[0]?.to_if_alone?.[0]?.key_code === "escape",
);
check("TG(3) が 2 本に展開される", byKey("right_command").length === 2);
check(
  "TG(3) は倒す側が先",
  byKey("right_command")[0]?.to?.[0]?.set_variable?.value === 0 &&
    byKey("right_command")[1]?.to?.[0]?.set_variable?.value === 1,
);
check(
  "KC_NO は to を持たない manipulator",
  byKey("q")[0] !== undefined && byKey("q")[0].to === undefined,
);
check("KC_TRNS は manipulator を出さない", byKey("w").length === 0);
check(
  "layer 2 の caps_lock は layer 0 と同値なので出さない",
  byKey("caps_lock").length === 1,
  `${byKey("caps_lock").length} 件`,
);
check(
  "全 manipulator が内蔵キーボード限定",
  all.every((m) => m.conditions?.[0]?.identifiers?.[0]?.is_built_in_keyboard === true),
);
check(
  "layer 1 以上に variable_if が付く",
  byKey("h")[0]?.conditions?.some((c) => c.type === "variable_if" && c.name === "cornix_layer_1"),
);

console.log("3. 落とせない keycode の扱い");
const broken = generateAsset({
  ...DESIRED,
  layers: [{ z: "TD(0)", x: "LT1(TD(1))", c: "LCTL_T(M(0))" }],
});
check(
  "3 件すべて diagnostic になる",
  broken.diagnostics.length === 3,
  JSON.stringify(broken.diagnostics),
);
check("manipulator は 1 つも出ない", broken.asset.rules.length === 0);
check(
  "severity が error",
  broken.diagnostics.every((d) => d.severity === "error"),
);

console.log("4. karabiner_cli --lint-complex-modifications");
const workDir = mkdtempSync(join(tmpdir(), "r-006-"));
const assetPath = join(workDir, "cornix.json");
const generated = `${JSON.stringify(asset, null, 2)}\n`;
writeFileSync(assetPath, generated, "utf8");
let lintOutput = "";
try {
  lintOutput = execFileSync(KARABINER_CLI, ["--lint-complex-modifications", assetPath], {
    encoding: "utf8",
  });
} catch (error) {
  lintOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
}
check("lint が ok", lintOutput.trim().endsWith(": ok"), lintOutput.trim());

console.log("5. Karabiner の整形は JSON.stringify と一致しない");
execFileSync(KARABINER_CLI, ["--format-json", assetPath], { encoding: "utf8" });
const formatted = readFileSync(assetPath, "utf8");
check(
  "--format-json がテキストを書き換える",
  formatted !== generated,
  "一致した場合、テキスト比較で diff を取れる可能性がある",
);
check("構造としては等価", JSON.stringify(JSON.parse(formatted)) === JSON.stringify(asset));

console.log("6. profile の所有範囲");
const { profile } = generateProfile(DESIRED);
check("profile 名が固定", profile.name === "Cornix Bonsai");
check("selected を持たない", !("selected" in profile));
check("simple_modifications を持たない", !("simple_modifications" in profile));

console.log(`\n${failures === 0 ? "すべて成功" : `${failures} 件失敗`}`);
process.exit(failures === 0 ? 0 : 1);
