import { XzReadableStream } from "xz-decompress";
import {
  snapshotFromDocument,
  readVialDevice,
  VIAL_USAGE,
  VIAL_USAGE_PAGE,
  VialSession,
  writeAndVerify,
  type DeviceReadResult,
  type HidDeviceLike,
  type RoundTripProgress,
} from "./protocol.ts";
import type { DeviceSnapshot } from "../core/apply/plan.ts";
import type { WriteTarget } from "../core/apply/targets.ts";

export interface DeviceInfo {
  readonly productName: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly opened: boolean;
}

export interface ReadDeviceResult extends DeviceReadResult {
  readonly snapshot: DeviceSnapshot;
}

interface RawHidDevice {
  readonly productName: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly opened: boolean;
  readonly collections: readonly { readonly usagePage: number; readonly usage: number }[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: Uint8Array): Promise<void>;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface HidNavigator {
  hid: {
    getDevices(): Promise<readonly RawHidDevice[]>;
    requestDevice(options: {
      filters: readonly { usagePage: number; usage: number }[];
    }): Promise<readonly RawHidDevice[]>;
  };
}

class BrowserHidTransport implements HidDeviceLike {
  readonly raw: RawHidDevice;
  constructor(raw: RawHidDevice) {
    this.raw = raw;
  }
  get opened(): boolean {
    return this.raw.opened;
  }
  open(): Promise<void> {
    return this.raw.open();
  }
  close(): Promise<void> {
    return this.raw.close();
  }
  sendReport(reportId: number, data: Uint8Array): Promise<void> {
    return this.raw.sendReport(reportId, data);
  }
  addEventListener(type: "inputreport" | "disconnect", listener: (event: unknown) => void): void {
    this.raw.addEventListener(type, listener as EventListener);
  }
  removeEventListener(
    type: "inputreport" | "disconnect",
    listener: (event: unknown) => void,
  ): void {
    this.raw.removeEventListener(type, listener as EventListener);
  }
}

/** WebHID の接続境界。device handleはここに閉じ、React stateへ持ち込まない。 */
export class WebHidConnection {
  private readonly device: RawHidDevice;
  private readonly transport: BrowserHidTransport;
  constructor(device: RawHidDevice) {
    this.device = device;
    this.transport = new BrowserHidTransport(device);
  }

  get info(): DeviceInfo {
    return {
      productName: this.device.productName ?? "Cornix LP",
      vendorId: this.device.vendorId,
      productId: this.device.productId,
      opened: this.device.opened,
    };
  }

  async read(onProgress?: (progress: RoundTripProgress) => void): Promise<ReadDeviceResult> {
    const session = new VialSession(this.transport, onProgress === undefined ? {} : { onProgress });
    try {
      const result = await readVialDevice(session, decodeXz, onProgress);
      return { ...result, snapshot: snapshotFromDocument(result.document, result.definition) };
    } finally {
      session.close();
    }
  }

  async writeAndVerify(
    target: WriteTarget,
    after: readonly number[],
    onProgress?: (progress: RoundTripProgress) => void,
  ): Promise<readonly number[]> {
    const session = new VialSession(this.transport, onProgress === undefined ? {} : { onProgress });
    try {
      return await writeAndVerify(session, target, after);
    } finally {
      session.close();
    }
  }

  async close(): Promise<void> {
    if (this.device.opened) await this.device.close();
  }
}

/** @doc docs/specs/device-adapter.md#browser-adapter */
export class WebHidAdapter {
  async list(): Promise<readonly DeviceInfo[]> {
    return (await (navigator as unknown as HidNavigator).hid.getDevices())
      .filter(isVialDevice)
      .map((device) => describe(device));
  }

  /** chooserは常に明示的に出し、getDevices()が空でも再選択を可能にする。 */
  async request(): Promise<WebHidConnection | undefined> {
    const devices = await (navigator as unknown as HidNavigator).hid.requestDevice({
      filters: [{ usagePage: VIAL_USAGE_PAGE, usage: VIAL_USAGE }],
    });
    const device = devices.find(isVialDevice);
    if (device === undefined) return undefined;
    return this.connectDevice(device);
  }

  /** permission済みdeviceを毎回getDevices()から再取得する。古いHIDDeviceは再利用しない。 */
  async reacquire(
    preferred?: Pick<DeviceInfo, "vendorId" | "productId">,
  ): Promise<WebHidConnection | undefined> {
    const device = (await (navigator as unknown as HidNavigator).hid.getDevices())
      .filter(isVialDevice)
      .find(
        (candidate) =>
          preferred === undefined ||
          (candidate.vendorId === preferred.vendorId &&
            candidate.productId === preferred.productId),
      );
    return device === undefined ? undefined : this.connectDevice(device);
  }

  private async connectDevice(device: RawHidDevice): Promise<WebHidConnection> {
    if (device.opened) await device.close();
    await device.open();
    return new WebHidConnection(device);
  }
}

export function isVialDevice(device: RawHidDevice): boolean {
  return device.collections.some(
    (collection) => collection.usagePage === VIAL_USAGE_PAGE && collection.usage === VIAL_USAGE,
  );
}

function describe(device: RawHidDevice): DeviceInfo {
  return {
    productName: device.productName ?? "Cornix LP",
    vendorId: device.vendorId,
    productId: device.productId,
    opened: device.opened,
  };
}

async function decodeXz(compressed: Uint8Array): Promise<string> {
  const stream = new XzReadableStream(new Blob([compressed.buffer as ArrayBuffer]).stream());
  return new Response(stream).text();
}
