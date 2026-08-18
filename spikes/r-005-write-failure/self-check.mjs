// R-005 Spike: write が失敗する経路を mock 上で再現し、
// 「再 read で検出できる失敗」と「検出できない失敗」を切り分ける。実機は使わない。
//
// 見るのは 3 つの観測点。
//   ack       ... command が応答を返したか（host が唯一直接得られる情報）
//   再read    ... write 後に読み直した値（RMK では RAM 上の値）
//   再起動後  ... 電源を入れ直した後の値（flash 上の値）
// この 3 つが食い違う組み合わせが、そのまま Apply フローの設計制約になる。

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPersistentMockDevice, FLASH_CHANNEL_SIZE } from "./mock-persistence.mjs";
import {
  applyDiff,
  burstWrite,
  readBackPositions,
  readSingleKeycode,
  scanEmptyPositions,
} from "./write-probe.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const definitionJson = JSON.parse(
  readFileSync(resolve(repoRoot, "fixtures/cornix-lp/vial-definition-v1.12.json"), "utf8"),
);
const baseline = JSON.parse(
  readFileSync(resolve(repoRoot, "fixtures/cornix-lp/baseline.vil"), "utf8"),
);

// WebHID の HIDDevice のうち write-probe.mjs が使う部分だけを持つ偽物。
// R-004 の self-check.mjs と同じ構造だが、応答が返らない（null）場合を扱える。
class FakeHidDevice {
  constructor(device) {
    this.device = device;
    this.opened = false;
    this.listeners = new Set();
    this.collections = [{ usagePage: 0xff60, usage: 0x61 }];
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
    const response = this.device.send(Uint8Array.from(data));
    // 応答が無い場合は input report を出さない = R-004 で実測した永久 pending と同じ形。
    if (response === null) return;
    queueMicrotask(() => {
      const view = new DataView(response.buffer, response.byteOffset, response.byteLength);
      for (const handler of this.listeners) handler({ data: view });
    });
  }
}

function newDevice(faults = {}) {
  const mock = createPersistentMockDevice({
    definitionJson,
    layers: baseline.layout.length,
    encoderCount: baseline.encoder_layout[0].length,
    morseCount: baseline.tap_dance.length,
    comboCount: baseline.combo.length,
    faults,
  });
  return { mock, hid: new FakeHidDevice(mock) };
}

// 書き換え対象。実機 probe と同じく 1 箇所だけ触る。
const TARGET = { layer: 3, row: 2, col: 4 };
const NEW_KEYCODE = 0x0004; // KC_A
const TIMEOUT_MS = 200; // mock は即応するので、詰まりを短時間で検出できる

const rows = [];
const problems = [];

function record(name, { ack, afterWrite, afterReboot, expected, detectable, note }) {
  rows.push({ name, ack, afterWrite, afterReboot, expected, detectable, note });
}

function check(ok, msg) {
  console.log(`${ok ? "OK  " : "NG  "} ${msg}`);
  if (!ok) problems.push(msg);
}

const hex = (v) => (v === null || v === undefined ? "-" : `0x${v.toString(16).padStart(4, "0")}`);

// --- 1. 正常系 ---------------------------------------------------------------
{
  const { mock, hid } = newDevice();
  const before = mock.readKeycode(TARGET.layer, TARGET.row, TARGET.col);
  const result = await applyDiff(hid, [{ kind: "keymap", ...TARGET, to: NEW_KEYCODE }], {
    timeoutMs: TIMEOUT_MS,
  });
  const afterWrite = mock.readKeycode(TARGET.layer, TARGET.row, TARGET.col);
  mock.reboot();
  const afterReboot = mock.readKeycode(TARGET.layer, TARGET.row, TARGET.col);
  record("正常に write できた", {
    ack: "あり",
    afterWrite: hex(afterWrite),
    afterReboot: hex(afterReboot),
    expected: hex(NEW_KEYCODE),
    detectable: "-",
    note: `write 前は ${hex(before)}`,
  });
  check(result.applied.length === 1 && result.error === null, "正常系: 差分 1 件が verify を通る");
  check(afterReboot === NEW_KEYCODE, "正常系: 再起動しても値が残る");
}

// --- 2. store_item が失敗する（flash が満杯 / 壊れている） --------------------
{
  const { mock, hid } = newDevice({ flashError: (op) => op.kind === "KeymapKey" });
  const result = await applyDiff(hid, [{ kind: "keymap", ...TARGET, to: NEW_KEYCODE }], {
    timeoutMs: TIMEOUT_MS,
  });
  const afterWrite = mock.readKeycode(TARGET.layer, TARGET.row, TARGET.col);
  mock.reboot();
  const afterReboot = mock.readKeycode(TARGET.layer, TARGET.row, TARGET.col);
  record("flash 書き込みが失敗した", {
    ack: "あり",
    afterWrite: hex(afterWrite),
    afterReboot: hex(afterReboot),
    expected: hex(NEW_KEYCODE),
    detectable: "不可",
    note: "RMK は error! を出すだけで host へ返さない",
  });
  check(
    result.applied.length === 1 && afterWrite === NEW_KEYCODE,
    "flash 失敗: ack も再 read も成功に見える",
  );
  check(
    afterReboot !== NEW_KEYCODE && mock.state.failedOps === 1,
    "flash 失敗: 再起動すると巻き戻る（再 read では検出できない）",
  );
}

// --- 3. storage task が止まっている（FLASH_CHANNEL の backpressure） ---------
{
  const { mock, hid } = newDevice({ flashStalled: true });
  const entries = Array.from({ length: FLASH_CHANNEL_SIZE + 2 }, (_, i) => ({
    kind: "keymap",
    layer: TARGET.layer,
    row: TARGET.row,
    col: i,
    to: NEW_KEYCODE,
  }));
  const result = await applyDiff(hid, entries, { timeoutMs: TIMEOUT_MS });
  record("storage task が停止した", {
    ack: `${FLASH_CHANNEL_SIZE} 件まで`,
    afterWrite: "以降 timeout",
    afterReboot: "-",
    expected: "-",
    detectable: "可",
    note: `FLASH_CHANNEL（容量 ${FLASH_CHANNEL_SIZE}）が詰まると応答が返らない`,
  });
  check(
    result.error !== null && result.applied.length === FLASH_CHANNEL_SIZE,
    `storage 停止: ${FLASH_CHANNEL_SIZE} 件目までは通り、以降は timeout で止まる`,
  );
  check(
    result.stalledAt?.phase === "inputreport",
    "storage 停止: 応答待ちで止まる（sendReport は返る）",
  );
  check(mock.queue.length === FLASH_CHANNEL_SIZE, "storage 停止: 未処理の flash op が滞留する");
}

// --- 4. write の途中で切断された ---------------------------------------------
{
  // 1 entry あたり set + get の 2 往復。3 件目の set で切断する。
  const disconnectAt = 5;
  const { mock, hid } = newDevice({ disconnectAt });
  const entries = [0, 1, 2, 3].map((col) => ({
    kind: "keymap",
    layer: TARGET.layer,
    row: TARGET.row,
    col,
    to: NEW_KEYCODE,
  }));
  const before = entries.map((e) => mock.readKeycode(e.layer, e.row, e.col));
  const result = await applyDiff(hid, entries, { timeoutMs: TIMEOUT_MS });
  const after = entries.map((e) => mock.readKeycode(e.layer, e.row, e.col));
  mock.reboot();
  const afterReboot = entries.map((e) => mock.readKeycode(e.layer, e.row, e.col));
  record("write の途中で切断した", {
    ack: `${result.applied.length} 件まで`,
    afterWrite: after.map(hex).join(" "),
    afterReboot: afterReboot.map(hex).join(" "),
    expected: entries.map(() => hex(NEW_KEYCODE)).join(" "),
    detectable: "可",
    note: "適用済みの entry はそのまま残る。巻き戻らない",
  });
  check(result.error !== null, "切断: 差分適用が例外で止まる");
  check(
    result.applied.length === Math.floor((disconnectAt - 1) / 2),
    `切断: ${Math.floor((disconnectAt - 1) / 2)} 件だけ適用済みになる`,
  );
  check(
    afterReboot[0] === NEW_KEYCODE && afterReboot[3] === before[3],
    "切断: 適用済みは永続化され、未適用は元のまま（部分状態が残る）",
  );
}

// --- 5. 切断後の device をそのまま使い回す -----------------------------------
{
  const { hid } = newDevice({ disconnectAt: 1 });
  let error = null;
  try {
    await readSingleKeycode(hid, { ...TARGET, timeoutMs: TIMEOUT_MS });
  } catch (e) {
    error = String(e);
  }
  record("切断後の HIDDevice を使い回した", {
    ack: "なし",
    afterWrite: "timeout",
    afterReboot: "-",
    expected: "-",
    detectable: "可（timeout 必須）",
    note: "R-004 実測: sendReport が解決も拒否もしない",
  });
  check(error !== null, "切断後 device: timeout を置かないと無言で止まる");
}

// --- 6. 32 byte でない packet（BLE） -----------------------------------------
{
  const { mock } = newDevice();
  const response = mock.send(Uint8Array.from([0x05, 3, 2, 4, 0x00, 0x04])); // 6 byte
  record("32 byte 未満で送った", {
    ack: "なし",
    afterWrite: "変化なし",
    afterReboot: "変化なし",
    expected: "-",
    detectable: "可（timeout）",
    note: "RMK は長さ 32 以外の BLE packet を捨てる",
  });
  check(response === null, "短い packet: 応答も変更も無い");
}

// --- 7. lock 状態でも write は通る -------------------------------------------
{
  const { mock, hid } = newDevice();
  mock.state.unlocked = false;
  const result = await applyDiff(hid, [{ kind: "keymap", ...TARGET, to: NEW_KEYCODE }], {
    timeoutMs: TIMEOUT_MS,
  });
  record("lock されたまま write した", {
    ack: "あり",
    afterWrite: hex(mock.readKeycode(TARGET.layer, TARGET.row, TARGET.col)),
    afterReboot: "-",
    expected: hex(NEW_KEYCODE),
    detectable: "-",
    note: "RMK の write 系 command は unlock を確認しない",
  });
  check(result.applied.length === 1, "lock: keymap の write は lock 状態でも通る");
}

// --- 8. 範囲外の entry へ write した -----------------------------------------
{
  const { mock, hid } = newDevice();
  const result = await applyDiff(
    hid,
    [
      {
        kind: "tapDance",
        index: 999,
        to: { tap: 4, hold: 5, doubleTap: 6, holdAfterTap: 7, timeout: 200 },
      },
    ],
    { timeoutMs: TIMEOUT_MS },
  );
  const noop = mock.events.filter((e) => e.kind === "silentNoop");
  record("範囲外の index へ write した", {
    ack: "あり（return code 0）",
    afterWrite: "変化なし",
    afterReboot: "変化なし",
    expected: "-",
    detectable: "可（再 read）",
    note: "MorseSet は bounds check の前に成功コードを書く",
  });
  check(noop.length === 1, "範囲外: firmware 側は何もしない");
  check(
    result.mismatched.length === 1 && result.applied.length === 0,
    "範囲外: 再 read で不一致として検出できる",
  );
}

// --- 9. EepromReset を送った（mock のみ。実機へは送らない） ------------------
{
  const { mock, hid } = newDevice();
  await applyDiff(hid, [{ kind: "keymap", ...TARGET, to: NEW_KEYCODE }], { timeoutMs: TIMEOUT_MS });
  const eepromReset = new Uint8Array(32);
  eepromReset[0] = 0x0a;
  mock.send(eepromReset);
  const afterWrite = mock.readKeycode(TARGET.layer, TARGET.row, TARGET.col);
  mock.reboot();
  const afterReboot = mock.readKeycode(TARGET.layer, TARGET.row, TARGET.col);
  record("EepromReset を送った", {
    ack: "あり",
    afterWrite: hex(afterWrite),
    afterReboot: hex(afterReboot),
    expected: "firmware 既定",
    detectable: "可（再起動後）",
    note: "erase_all → 次回起動で firmware 既定へ初期化",
  });
  check(afterWrite === NEW_KEYCODE, "EepromReset: 送った直後の RAM は変わらない");
  check(afterReboot !== NEW_KEYCODE, "EepromReset: 再起動で全ての customization が消える");
}

// --- 10. backup からの再 write で戻せるか ------------------------------------
{
  const { mock, hid } = newDevice();
  const backup = mock.readKeycode(TARGET.layer, TARGET.row, TARGET.col);
  await applyDiff(hid, [{ kind: "keymap", ...TARGET, to: NEW_KEYCODE }], { timeoutMs: TIMEOUT_MS });
  const restore = await applyDiff(hid, [{ kind: "keymap", ...TARGET, to: backup }], {
    timeoutMs: TIMEOUT_MS,
  });
  mock.reboot();
  const afterReboot = mock.readKeycode(TARGET.layer, TARGET.row, TARGET.col);
  record("backup の値を書き戻した", {
    ack: "あり",
    afterWrite: hex(backup),
    afterReboot: hex(afterReboot),
    expected: hex(backup),
    detectable: "-",
    note: "rollback は同じ差分 write の裏返しでしかない",
  });
  check(
    restore.applied.length === 1 && afterReboot === backup,
    "rollback: backup 値の再 write で元に戻る",
  );
}

// --- 11. 0x13 DynamicKeymapSetBuffer の非対称性 ------------------------------
{
  const { mock } = newDevice();
  // read（0x12）と同じ offset の使い方で write すると、どこへ何が入るかを見る。
  const entryIndex = 10;
  const byteOffset = entryIndex * 2; // read ではこれが offset
  const keycode = 0x0004;
  const msg = new Uint8Array(32);
  msg[0] = 0x13;
  msg[1] = (byteOffset >> 8) & 0xff;
  msg[2] = byteOffset & 0xff;
  msg[3] = 1; // entry 1 件
  msg[4] = (keycode >> 8) & 0xff; // read と同じ BE で詰めた場合
  msg[5] = keycode & 0xff;
  mock.send(msg);
  const landedAt = mock.ram.keymap[byteOffset]; // write は offset を entry 番号として扱う
  record("0x13 を read と同じ offset で使った", {
    ack: "あり",
    afterWrite: `entry ${byteOffset} = ${hex(landedAt)}`,
    afterReboot: "同じ",
    expected: `entry ${entryIndex} = ${hex(keycode)}`,
    detectable: "可（再 read）",
    note: "offset は entry 単位、値は LE。read（byte 単位 / BE）と食い違う",
  });
  check(
    mock.ram.keymap[entryIndex] !== keycode,
    "0x13: 意図した entry には入らない（offset の単位が違う）",
  );
  check(
    landedAt === ((keycode >> 8) | ((keycode & 0xff) << 8)),
    "0x13: 値も byte が入れ替わる（LE で読まれる）",
  );
}

// --- 12. 0x13 の try_send は溢れると黙って捨てられる -------------------------
{
  const { mock } = newDevice({ flashStalled: true });
  const size = 14; // report に収まる最大 entry 数（4 + 14*2 = 32 byte）
  const msg = new Uint8Array(32);
  msg[0] = 0x13;
  msg[1] = 0;
  msg[2] = 0;
  msg[3] = size;
  mock.send(msg);
  record(`0x13 で ${size} entry を一度に送った`, {
    ack: "あり",
    afterWrite: `全 ${size} entry が変わる`,
    afterReboot: `先頭 ${FLASH_CHANNEL_SIZE} 件のみ`,
    expected: `全 ${size} entry`,
    detectable: "不可",
    note: `try_send は FLASH_CHANNEL（容量 ${FLASH_CHANNEL_SIZE}）が満杯だと捨てる`,
  });
  check(
    mock.state.droppedOps === size - FLASH_CHANNEL_SIZE,
    `0x13: ${size - FLASH_CHANNEL_SIZE} 件の flash op が黙って捨てられる`,
  );
}

// --- 13. 0x13 に VIA と同じ size（byte 数）を渡した ---------------------------
{
  const { mock } = newDevice();
  const size = 28; // VIA / vial-gui の size は byte 数。RMK は entry 数として扱う
  const msg = new Uint8Array(32);
  msg[0] = 0x13;
  msg[3] = size;
  const response = mock.send(msg);
  record("0x13 に size=28（byte 数）を渡した", {
    ack: "なし",
    afterWrite: "以降 応答なし",
    afterReboot: "-",
    expected: "-",
    detectable: "可（timeout）",
    note: "RMK は 32 byte の report を超えて読みにいき panic する",
  });
  check(
    response === null && mock.state.panicked,
    "0x13: size を byte 数として渡すと firmware が落ちる",
  );
  check(
    mock.events.some((e) => e.kind === "firmwarePanic"),
    "0x13: 範囲外読み出しが起きる（Rust の slice index panic）",
  );
}

// --- 14. 連続 write の途中で電源が落ちた（実機手順 6 と同じ形） ---------------
{
  // 実機手順 6 は「空き位置を洗い出す → 連続 write → 途中で電源断 → 読み戻す」。
  // 同じ順序を mock で通し、境界が連続することと、
  // ack が返ったのに flash へ載らなかったぶんが数えられることを確かめる。
  const rows = 8;
  const cols = 7;
  const layer = 9;
  // 実機の layer 9 と同じ状態を作る。RAM だけでなく flash も空にしないと、
  // 再起動時に元の値へ戻ってしまい「消えた」と区別できない。
  const clearLayer = (m) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = layer * rows * cols + r * cols + c;
        m.ram.keymap[i] = 0;
        m.flash.set(0x1000 + i, 0);
      }
    }
  };
  const { mock, hid } = newDevice();
  clearLayer(mock);
  const scan = await scanEmptyPositions(hid, { layers: [layer], timeoutMs: TIMEOUT_MS });
  const valueFor = (i) => 0x0004 + (i % 90);

  // 走査ぶんの往復を数えたうえで、write の途中で切断する device を作り直す。
  const cut = 20;
  const { mock: mock2, hid: hid2 } = newDevice({ disconnectAt: cut });
  clearLayer(mock2);
  const burst = await burstWrite(hid2, {
    targets: scan.empty,
    valueFor,
    timeoutMs: TIMEOUT_MS,
  });
  mock2.reboot();
  // 読み戻しは切断済みの device では通らないので、mock の状態を直接見る。
  const kept = scan.empty.filter(
    (t, i) => mock2.readKeycode(t.layer, t.row, t.col) === valueFor(i),
  ).length;
  const firstCleared = scan.empty.findIndex((t) => mock2.readKeycode(t.layer, t.row, t.col) === 0);

  record("連続 write の途中で電源が落ちた", {
    ack: `${burst.acked} 件`,
    afterWrite: "—",
    afterReboot: `${kept} 件残る`,
    expected: `${scan.empty.length} 件`,
    detectable: "可（読み戻し）",
    note: "ack が返った件数までが残り、境界は連続する",
  });
  check(scan.empty.length === rows * cols, `走査: layer ${layer} の空き ${rows * cols} 件を拾う`);
  check(burst.error !== null && burst.acked === cut - 1, `burst: ${cut - 1} 件で止まる`);
  check(kept === burst.acked, "burst: ack が返った件数だけが電源断後も残る");
  check(firstCleared === burst.acked, "burst: 残った位置と消えた位置の境界が連続する");
}

// --- 結果表 ------------------------------------------------------------------
console.log("\n== 失敗モードと観測点 ==\n");
const header = ["ケース", "ack", "再 read", "再起動後", "期待値", "再 read で検出"];
const table = rows.map((r) => [
  r.name,
  r.ack,
  r.afterWrite,
  r.afterReboot,
  r.expected,
  r.detectable,
]);
const widths = header.map((h, i) => Math.max(width(h), ...table.map((row) => width(row[i]))));
const line = (cells) => `| ${cells.map((c, i) => pad(c, widths[i])).join(" | ")} |`;
console.log(line(header));
console.log(`| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`);
for (const row of table) console.log(line(row));
console.log("");
for (const r of rows) console.log(`- ${r.name}: ${r.note}`);

function width(s) {
  // 日本語を 2 桁として数える
  return [...String(s)].reduce((n, c) => n + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
}
function pad(s, w) {
  return String(s) + " ".repeat(Math.max(0, w - width(s)));
}

console.log(problems.length === 0 ? "\nすべて想定どおり" : `\n想定と違う: ${problems.length} 件`);
process.exitCode = problems.length === 0 ? 0 : 1;
