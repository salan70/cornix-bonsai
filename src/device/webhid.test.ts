import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import { VIAL_USAGE, VIAL_USAGE_PAGE } from "./protocol.ts";
import { WebHidAdapter } from "./webhid.ts";

function createRawDevice(usagePage = VIAL_USAGE_PAGE) {
  return {
    productName: "Cornix LP",
    vendorId: 0xe118,
    productId: 0x0001,
    opened: false,
    collections: [{ usagePage, usage: VIAL_USAGE }],
    async open(): Promise<void> {
      (this as { opened: boolean }).opened = true;
    },
    async close(): Promise<void> {
      (this as { opened: boolean }).opened = false;
    },
    async sendReport(): Promise<void> {},
    addEventListener(): void {},
    removeEventListener(): void {},
  };
}

function createNavigator(devices: readonly ReturnType<typeof createRawDevice>[]) {
  const listeners = new Set<(event: unknown) => void>();
  return {
    hid: {
      async getDevices() {
        return devices;
      },
      async requestDevice() {
        return devices;
      },
      addEventListener(_type: "disconnect", listener: (event: unknown) => void) {
        listeners.add(listener);
      },
      removeEventListener(_type: "disconnect", listener: (event: unknown) => void) {
        listeners.delete(listener);
      },
    },
    emitDisconnect(device: unknown): void {
      for (const listener of [...listeners]) listener({ device });
    },
    get listenerCount(): number {
      return listeners.size;
    },
  };
}

test("I/Oをしていない間の切断もconnectionから通知する", async () => {
  const device = createRawDevice();
  const hid = createNavigator([device]);
  const connection = await new WebHidAdapter(hid as never).reacquire();
  if (connection === undefined) throw new Error("permission済みdeviceを取得できなかった");

  const events: string[] = [];
  const unsubscribe = connection.onDisconnect(() => events.push("disconnected"));

  // 別deviceの切断では発火しない。
  hid.emitDisconnect(createRawDevice());
  deepStrictEqual(events, []);

  hid.emitDisconnect(device);
  deepStrictEqual(events, ["disconnected"]);

  unsubscribe();
  hid.emitDisconnect(device);
  deepStrictEqual(events, ["disconnected"]);
  strictEqual(hid.listenerCount, 0);
});

test("Vial collectionを持たないdeviceは再取得の対象にしない", async () => {
  const hid = createNavigator([createRawDevice(0x0001)]);
  strictEqual(await new WebHidAdapter(hid as never).reacquire(), undefined);
  deepStrictEqual(await new WebHidAdapter(hid as never).list(), []);
});
