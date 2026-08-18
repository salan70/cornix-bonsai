// probe.mjs が組み立てる command 列が R-003 の read フローと同じであることを、
// 実機なしで確かめる。R-003 の mock device（RMK 側の応答を写したもの）を
// WebHID の device に見せかけて runReadFlow を通す。
//
// ここで検証するのは byte の組み立てと往復数だけで、transport の挙動は対象外。
// transport は index.html を実機に対して実行して測る。

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createMockDevice } from "../r-003-vial-read-flow/mock-device.mjs";
import { runReadFlow } from "./probe.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const definitionJson = JSON.parse(
  readFileSync(resolve(repoRoot, "fixtures/cornix-lp/vial-definition-v1.12.json"), "utf8"),
);
const baseline = JSON.parse(
  readFileSync(resolve(repoRoot, "fixtures/cornix-lp/baseline.vil"), "utf8"),
);

const mock = createMockDevice({
  definitionJson,
  layers: baseline.layout.length,
  encoderCount: baseline.encoder_layout[0].length,
  morseCount: baseline.tap_dance.length,
  comboCount: baseline.combo.length,
});

// WebHID の HIDDevice のうち、probe.mjs が使う部分だけを持つ偽物。
class FakeHidDevice {
  constructor(device) {
    this.device = device;
    this.opened = false;
    this.listeners = new Set();
    this.collections = [
      { usagePage: 0xff60, usage: 0x61, inputReports: [], outputReports: [], featureReports: [] },
    ];
  }

  async open() {
    this.opened = true;
  }

  addEventListener(type, handler) {
    if (type === "inputreport") this.listeners.add(handler);
  }

  removeEventListener(type, handler) {
    if (type === "inputreport") this.listeners.delete(handler);
  }

  async sendReport(reportId, data) {
    if (reportId !== 0x00) throw new Error(`予期しない reportId: ${reportId}`);
    if (data.length !== 32) throw new Error(`予期しない report 長: ${data.length}`);
    const response = this.device.send(Uint8Array.from(data));
    // 実機と同様、送信の完了後に非同期で input report が返る。
    queueMicrotask(() => {
      const view = new DataView(response.buffer, response.byteOffset, response.byteLength);
      for (const handler of this.listeners) handler({ data: view });
    });
  }
}

const result = await runReadFlow(new FakeHidDevice(mock), { timeoutMs: 1000 });

const problems = [];
const check = (ok, msg) => {
  console.log(`${ok ? "OK  " : "NG  "} ${msg}`);
  if (!ok) problems.push(msg);
};

console.log("== probe.mjs が mock device から読めたもの ==");
console.log(JSON.stringify(result.steps, null, 2));
console.log("");

check(
  result.errors.length === 0,
  `read フローが例外なく完走する（errors=${result.errors.length}）`,
);
check(result.steps.layerCount === baseline.layout.length, "layer 数が baseline.vil と一致する");
check(
  result.steps.tapDanceCount === baseline.tap_dance.length,
  "tap dance 本数が baseline.vil と一致する",
);
check(result.steps.comboCount === baseline.combo.length, "combo 本数が baseline.vil と一致する");
check(
  JSON.stringify(result.steps.qsids) ===
    JSON.stringify(Object.keys(baseline.settings ?? {}).map(Number)),
  "qsid の集合が baseline.vil と一致する",
);
check(
  result.roundTrip.count === 168,
  `往復数が R-003 の実測と一致する（実測 168 / 今回 ${result.roundTrip.count}）`,
);

if (result.errors.length > 0) console.log(result.errors.join("\n"));
console.log(problems.length === 0 ? "\nすべて一致した" : `\n不一致: ${problems.length} 件`);
process.exitCode = problems.length === 0 ? 0 : 1;
