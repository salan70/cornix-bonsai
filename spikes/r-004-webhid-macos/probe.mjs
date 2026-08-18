// R-004 Spike: macOS + Chromium の WebHID で Cornix LP へ read だけを行い、
// transport (USB / BLE) ごとの挙動と所要時間を記録する。
// write 系 command は一切送らない（AGENTS.md の禁止操作）。

const VIAL_USAGE_PAGE = 0xff60;
const VIAL_USAGE = 0x61;
const REPORT_ID = 0x00;
const REPORT_SIZE = 32;

// R-003 で確定した read 系 command のみ。write 系は定義しない。
const CMD = {
  GET_PROTOCOL_VERSION: 0x01,
  GET_KEYBOARD_VALUE: 0x02,
  MACRO_GET_COUNT: 0x0c,
  MACRO_GET_BUFFER_SIZE: 0x0d,
  MACRO_GET_BUFFER: 0x0e,
  GET_LAYER_COUNT: 0x11,
  KEYMAP_GET_BUFFER: 0x12,
  VIAL_PREFIX: 0xfe,
};
const VIAL = {
  GET_KEYBOARD_ID: 0x00,
  GET_SIZE: 0x01,
  GET_DEFINITION: 0x02,
  GET_ENCODER: 0x03,
  QMK_SETTINGS_QUERY: 0x09,
  QMK_SETTINGS_GET: 0x0a,
  DYNAMIC_ENTRY_OP: 0x0d,
};
const DYNAMIC = {
  GET_NUMBER_OF_ENTRIES: 0x00,
  MORSE_GET: 0x01,
  COMBO_GET: 0x03,
};

// Cornix LP の keyboard definition 由来の定数（fixtures/cornix-lp/vial-definition-v1.12.json）。
// 本実装では definition を実機から読んで展開するが、この Spike は xz decoder を持たないため固定値を使う。
const MATRIX_ROWS = 8;
const MATRIX_COLS = 7;
const ENCODER_COUNT = 2;

const KEYMAP_CHUNK = 28;
const MACRO_CHUNK = 28;
const DEFINITION_CHUNK = 32;
const DEFAULT_TIMEOUT_MS = 3000;

class VialSession {
  constructor(device, { timeoutMs = DEFAULT_TIMEOUT_MS, onRoundTrip } = {}) {
    this.device = device;
    this.timeoutMs = timeoutMs;
    this.onRoundTrip = onRoundTrip;
    this.pending = null;
    this.stalledAt = null;
    this.roundTrips = [];
    this.handler = (event) => {
      if (!this.pending) return;
      const resolve = this.pending.resolve;
      this.pending = null;
      resolve(new Uint8Array(event.data.buffer.slice(0)));
    };
    device.addEventListener("inputreport", this.handler);
  }

  close() {
    this.device.removeEventListener("inputreport", this.handler);
  }

  // 1 往復。sendReport と応答待ちの両方に timeout をかけ、どちらで詰まったかを残す。
  // sendReport 自体が返らない事例があるため、await を timeout と race させる必要がある。
  async request(bytes, label) {
    if (this.pending) throw new Error("前の request が終わっていない");
    const out = new Uint8Array(REPORT_SIZE);
    out.set(bytes.slice(0, REPORT_SIZE));
    let phase = "sendReport";
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timeout ${this.timeoutMs}ms: ${label} (${phase} で停止)`)),
        this.timeoutMs,
      );
    });
    timeout.catch(() => {}); // race で拾われなかった場合の unhandled rejection を防ぐ
    // 応答は sendReport の解決前に届きうるので、送信前に受け口を用意する。
    const response = new Promise((resolve) => {
      this.pending = { resolve };
    });
    const started = performance.now();
    try {
      await Promise.race([this.device.sendReport(REPORT_ID, out), timeout]);
      phase = "inputreport";
      const data = await Promise.race([response, timeout]);
      const elapsed = performance.now() - started;
      this.roundTrips.push({ label, ms: elapsed });
      this.onRoundTrip?.(this.roundTrips.length, label, elapsed);
      return data;
    } catch (error) {
      this.stalledAt = { n: this.roundTrips.length + 1, label, phase };
      throw error;
    } finally {
      clearTimeout(timer);
      this.pending = null;
    }
  }

  stats() {
    const values = this.roundTrips.map((r) => r.ms).sort((a, b) => a - b);
    if (values.length === 0) return null;
    const at = (q) => values[Math.min(values.length - 1, Math.floor(values.length * q))];
    const total = values.reduce((a, b) => a + b, 0);
    return {
      count: values.length,
      totalMs: round(total),
      minMs: round(values[0]),
      p50Ms: round(at(0.5)),
      p95Ms: round(at(0.95)),
      maxMs: round(values[values.length - 1]),
    };
  }
}

const round = (n) => Math.round(n * 100) / 100;
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));

function concat(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
const be16 = (d, i) => (d[i] << 8) | d[i + 1];
const le16 = (d, i) => d[i] | (d[i + 1] << 8);
const le32 = (d, i) => (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0;
const u16le = (v) => [v & 0xff, (v >> 8) & 0xff];
const u32le = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff];

export function describeDevice(device) {
  return {
    productName: device.productName,
    vendorId: `0x${device.vendorId.toString(16).padStart(4, "0")}`,
    productId: `0x${device.productId.toString(16).padStart(4, "0")}`,
    opened: device.opened,
    collections: device.collections.map((c) => ({
      usagePage: `0x${c.usagePage.toString(16)}`,
      usage: `0x${c.usage.toString(16)}`,
      inputReports: (c.inputReports ?? []).map((r) => ({
        reportId: r.reportId,
        bytes: reportBytes(r),
      })),
      outputReports: (c.outputReports ?? []).map((r) => ({
        reportId: r.reportId,
        bytes: reportBytes(r),
      })),
      featureReports: (c.featureReports ?? []).length,
    })),
  };
}

function reportBytes(report) {
  const bits = (report.items ?? []).reduce(
    (sum, item) => sum + (item.reportSize ?? 0) * (item.reportCount ?? 0),
    0,
  );
  return bits / 8;
}

export function isVialDevice(device) {
  return device.collections.some((c) => c.usagePage === VIAL_USAGE_PAGE && c.usage === VIAL_USAGE);
}

export async function requestVialDevice() {
  const devices = await navigator.hid.requestDevice({
    filters: [{ usagePage: VIAL_USAGE_PAGE, usage: VIAL_USAGE }],
  });
  return devices[0] ?? null;
}

export async function requestAnyDevice() {
  const devices = await navigator.hid.requestDevice({ filters: [] });
  return devices[0] ?? null;
}

// 1 往復だけ試す。read フロー全体を流す前の疎通確認と、transport ごとの切り分けに使う。
export async function pingDevice(device, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!device.opened) await device.open();
  const session = new VialSession(device, { timeoutMs });
  try {
    const d = await session.request([CMD.GET_PROTOCOL_VERSION], "via protocol version");
    return { ok: true, viaProtocol: be16(d, 1), ms: round(session.roundTrips[0].ms) };
  } catch (error) {
    return { ok: false, error: String(error), stalledAt: session.stalledAt };
  } finally {
    session.close();
  }
}

// R-003 の read フローと同じ順序・同じ分割単位で、read command だけを一巡させる。
// 目的は値の再構築ではなく、往復数と所要時間、transport 固有の失敗を観測すること。
export async function runReadFlow(device, { onProgress, timeoutMs } = {}) {
  if (!device.opened) await device.open();
  const session = new VialSession(device, {
    timeoutMs,
    onRoundTrip: (n, label, ms) => onProgress?.({ n, label, ms }),
  });
  const result = { steps: {}, raw: {}, errors: [] };
  const started = performance.now();
  try {
    const protocol = await session.request([CMD.GET_PROTOCOL_VERSION], "via protocol version");
    result.steps.viaProtocol = be16(protocol, 1);

    const kbId = await session.request([CMD.VIAL_PREFIX, VIAL.GET_KEYBOARD_ID], "vial keyboard id");
    result.steps.vialProtocol = le32(kbId, 0);
    result.steps.uid = Array.from(kbId.slice(4, 12))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const sizeResp = await session.request(
      [CMD.VIAL_PREFIX, VIAL.GET_SIZE],
      "vial definition size",
    );
    const definitionSize = le32(sizeResp, 0);
    result.steps.definitionSize = definitionSize;
    let pages = 0;
    const definitionChunks = [];
    for (let remaining = definitionSize; remaining > 0; remaining -= DEFINITION_CHUNK, pages += 1) {
      const page = await session.request(
        [CMD.VIAL_PREFIX, VIAL.GET_DEFINITION, ...u32le(pages)],
        `definition page ${pages}`,
      );
      definitionChunks.push(remaining < DEFINITION_CHUNK ? page.subarray(0, remaining) : page);
    }
    result.steps.definitionPages = pages;
    // xz 圧縮のまま持ち帰る。展開と JSON の比較は node 側で行う（この Spike に xz decoder は無い）。
    result.raw.definitionXz = toBase64(concat(definitionChunks));

    const layers = await session.request([CMD.GET_LAYER_COUNT], "layer count");
    const layerCount = layers[1];
    result.steps.layerCount = layerCount;

    const macroCount = await session.request([CMD.MACRO_GET_COUNT], "macro count");
    result.steps.macroCount = macroCount[1];
    const macroSize = await session.request([CMD.MACRO_GET_BUFFER_SIZE], "macro buffer size");
    const macroBufferSize = be16(macroSize, 1);
    result.steps.macroBufferSize = macroBufferSize;

    // vial-gui と同じく vial protocol 4 以降でのみ settings を読む。
    const qsids = [];
    if (result.steps.vialProtocol >= 4) {
      let cur = 0;
      while (cur !== 0xffff) {
        const resp = await session.request(
          [CMD.VIAL_PREFIX, VIAL.QMK_SETTINGS_QUERY, ...u16le(cur)],
          `settings query ${cur}`,
        );
        for (let i = 0; i < REPORT_SIZE; i += 2) {
          const qsid = le16(resp, i);
          cur = Math.max(cur, qsid);
          if (qsid !== 0xffff) qsids.push(qsid);
        }
      }
      result.raw.settings = {};
      for (const qsid of qsids) {
        const d = await session.request(
          [CMD.VIAL_PREFIX, VIAL.QMK_SETTINGS_GET, ...u16le(qsid)],
          `settings get ${qsid}`,
        );
        result.raw.settings[qsid] = toBase64(d.subarray(0, 5));
      }
    }
    result.steps.qsids = qsids;

    const entries = await session.request(
      [CMD.VIAL_PREFIX, VIAL.DYNAMIC_ENTRY_OP, DYNAMIC.GET_NUMBER_OF_ENTRIES],
      "dynamic entry count",
    );
    const tapDanceCount = entries[0];
    const comboCount = entries[1];
    result.steps.tapDanceCount = tapDanceCount;
    result.steps.comboCount = comboCount;
    result.steps.keyOverrideCount = entries[2];
    result.steps.altRepeatKeyCount = entries[3];

    const keymapBytes = layerCount * MATRIX_ROWS * MATRIX_COLS * 2;
    const keymap = new Uint8Array(keymapBytes);
    for (let offset = 0; offset < keymapBytes; offset += KEYMAP_CHUNK) {
      const size = Math.min(KEYMAP_CHUNK, keymapBytes - offset);
      const chunk = await session.request(
        [CMD.KEYMAP_GET_BUFFER, (offset >> 8) & 0xff, offset & 0xff, size],
        `keymap buffer @${offset}`,
      );
      keymap.set(chunk.subarray(4, 4 + size), offset);
    }
    result.raw.keymap = toBase64(keymap);

    result.raw.encoders = [];
    for (let layer = 0; layer < layerCount; layer += 1) {
      for (let index = 0; index < ENCODER_COUNT; index += 1) {
        const d = await session.request(
          [CMD.VIAL_PREFIX, VIAL.GET_ENCODER, layer, index],
          `encoder L${layer} #${index}`,
        );
        // direction 0 = 反時計回り、1 = 時計回り（ADR 0002）
        result.raw.encoders.push({ layer, index, ccw: be16(d, 0), cw: be16(d, 2) });
      }
    }

    const layoutOptions = await session.request([CMD.GET_KEYBOARD_VALUE, 0x02], "layout options");
    result.raw.layoutOptions =
      (layoutOptions[2] << 24) |
      (layoutOptions[3] << 16) |
      (layoutOptions[4] << 8) |
      layoutOptions[5];

    // vial-gui は NUL の数が macro 本数を超えた時点で読むのをやめる。往復数を合わせるため同じ条件で打ち切る。
    let nulSeen = 0;
    const macroChunks = [];
    for (let offset = 0; offset < macroBufferSize; offset += MACRO_CHUNK) {
      const size = Math.min(MACRO_CHUNK, macroBufferSize - offset);
      const chunk = await session.request(
        [CMD.MACRO_GET_BUFFER, (offset >> 8) & 0xff, offset & 0xff, size],
        `macro buffer @${offset}`,
      );
      macroChunks.push(chunk.subarray(4, 4 + size));
      nulSeen += chunk.subarray(4, 4 + size).filter((b) => b === 0).length;
      if (nulSeen > result.steps.macroCount) break;
    }

    result.raw.macroBuffer = toBase64(concat(macroChunks));

    result.raw.tapDance = [];
    for (let i = 0; i < tapDanceCount; i += 1) {
      const d = await session.request(
        [CMD.VIAL_PREFIX, VIAL.DYNAMIC_ENTRY_OP, DYNAMIC.MORSE_GET, i],
        `tap dance ${i}`,
      );
      result.raw.tapDance.push(toBase64(d.subarray(0, 11)));
    }
    result.raw.combo = [];
    for (let i = 0; i < comboCount; i += 1) {
      const d = await session.request(
        [CMD.VIAL_PREFIX, VIAL.DYNAMIC_ENTRY_OP, DYNAMIC.COMBO_GET, i],
        `combo ${i}`,
      );
      result.raw.combo.push(toBase64(d.subarray(0, 11)));
    }
  } catch (error) {
    result.errors.push(String(error));
  } finally {
    result.wallClockMs = round(performance.now() - started);
    result.roundTrip = session.stats();
    result.stalledAt = session.stalledAt;
    result.deviceOpened = device.opened;
    result.slowest = session.roundTrips
      .slice()
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5)
      .map((r) => ({ label: r.label, ms: round(r.ms) }));
    session.close();
  }
  return result;
}
