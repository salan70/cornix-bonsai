import type { HidDeviceLike } from "./protocol.ts";

export type MockResponder = (
  request: Uint8Array,
) => Uint8Array | undefined | Promise<Uint8Array | undefined>;

/** 実機を触らずにVial reportの往復とdisconnect/timeoutを検証するmock。 */
export class MockHidDevice implements HidDeviceLike {
  opened = false;
  private readonly responder: MockResponder;
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(responder: MockResponder) {
    this.responder = responder;
  }

  async open(): Promise<void> {
    this.opened = true;
  }
  async close(): Promise<void> {
    this.opened = false;
  }
  async sendReport(_reportId: number, data: Uint8Array): Promise<void> {
    const response = await this.responder(new Uint8Array(data));
    if (response === undefined) return;
    queueMicrotask(() =>
      this.emit("inputreport", {
        data: new DataView(response.buffer, response.byteOffset, response.byteLength),
      }),
    );
  }
  addEventListener(type: "inputreport" | "disconnect", listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(
    type: "inputreport" | "disconnect",
    listener: (event: unknown) => void,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }
  disconnect(): void {
    this.opened = false;
    this.emit("disconnect", {});
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}
