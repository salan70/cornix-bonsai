import { useEffect, useRef, useState } from "react";
import { canonicalDefinitionText } from "../../core/definition/identity.ts";
import type { RoundTripProgress } from "../../device/protocol.ts";
import {
  WebHidAdapter,
  type ReadDeviceResult,
  type WebHidConnection,
} from "../../device/webhid.ts";
import { definitionDigest, definitionPath } from "../../workspace/layout.ts";
import type { WorkspaceFileStore } from "../../workspace/types.ts";
import { errorMessage } from "./use-status.ts";

export interface DeviceOptions {
  readonly say: (message: string) => void;
  readonly setProgress: (progress: RoundTripProgress | undefined) => void;
  /**
   * 実機の状態が古くなったとき（切断、再接続、読み直しの開始）に呼ぶ。
   * Apply の途中状態はこの時点で捨てる（ADR 0005）。
   */
  readonly onStale: () => void;
}

/** 読み込んだ結果を workspace と照合するための文脈。 */
export interface DeviceReadContext {
  readonly store: WorkspaceFileStore;
  readonly definitionDigest: string;
  readonly keyboardUid: string;
}

/**
 * Cornix LP との WebHID 接続と、その接続で最後に読み込んだ実機の状態。
 *
 * device handle は `WebHidConnection` に閉じ、ここでは接続の有無と読込結果だけを持つ。
 * 切断を検知したら読込結果ごと捨て、再接続後の full read からやり直させる。
 *
 * @doc docs/specs/ui.md#状態の持ち方
 */
export function useDevice({ say, setProgress, onStale }: DeviceOptions) {
  const [connection, setConnection] = useState<WebHidConnection | undefined>();
  const [read, setRead] = useState<ReadDeviceResult | undefined>();
  const [definitionDigestValue, setDefinitionDigest] = useState<string | undefined>();
  const [lastReadRoundTrips, setLastReadRoundTrips] = useState(0);
  const [readAt, setReadAt] = useState<Date | undefined>();
  const [reading, setReading] = useState<RoundTripProgress | undefined>();
  const onStaleRef = useRef(onStale);
  onStaleRef.current = onStale;

  function invalidate(): void {
    setConnection(undefined);
    setRead(undefined);
    setDefinitionDigest(undefined);
    setLastReadRoundTrips(0);
    setReadAt(undefined);
    setReading(undefined);
    onStaleRef.current();
  }

  useEffect(() => {
    if (connection === undefined) return;
    return connection.onDisconnect(() => {
      invalidate();
      say("deviceが切断された。再接続してfull readからやり直してください");
    });
    // 購読は接続ごとに張り替える。
  }, [connection]);

  /** 許可済みの機器を取り直し、無ければ機器選択を開く。 */
  async function acquire(): Promise<WebHidConnection | undefined> {
    const adapter = new WebHidAdapter();
    const next = (await adapter.reacquire()) ?? (await adapter.request());
    if (next === undefined) {
      say("Vial deviceが選択されなかった");
      return undefined;
    }
    invalidate();
    setConnection(next);
    return next;
  }

  async function connect(): Promise<void> {
    try {
      if ((await acquire()) !== undefined) say("接続済み");
    } catch (error) {
      say(errorMessage(error));
    }
  }

  async function disconnect(): Promise<void> {
    try {
      await connection?.close();
      invalidate();
      say("切断した");
    } catch (error) {
      say(errorMessage(error));
    }
  }

  /** full read。往復回数を進捗として出す。読み終えた結果は採用しない。 */
  async function fullRead(target: WebHidConnection): Promise<ReadDeviceResult> {
    try {
      return await target.read((event) => {
        setLastReadRoundTrips(event.count);
        setReading(event);
        setProgress(event);
      });
    } finally {
      setReading(undefined);
    }
  }

  /** 読込結果を、この接続の実機の現在状態として採用する。 */
  function adoptRead(result: ReadDeviceResult, digest: string): void {
    setDefinitionDigest(digest);
    setRead(result);
    setReadAt(new Date());
  }

  /**
   * full read して現在状態を更新する。workspace があれば definition を保存し、UID と definition の一致を返す。
   * 一致しなくても目標状態は上書きしない。
   */
  async function readInto(
    target: WebHidConnection,
    context: DeviceReadContext | undefined,
  ): Promise<{ readonly mismatch: boolean }> {
    const result = await fullRead(target);
    const text = canonicalDefinitionText(result.definitionText);
    const digest = await definitionDigest(text, globalThis.crypto);
    let mismatch = false;
    if (context !== undefined) {
      await context.store.writeText(definitionPath(digest), text);
      mismatch = context.definitionDigest !== digest || context.keyboardUid !== result.keyboardUid;
    }
    adoptRead(result, digest);
    return { mismatch };
  }

  /** 画面の「実機から読み込む」。読み直しの開始で Apply の途中状態を捨てる。 */
  async function readDevice(context: DeviceReadContext | undefined): Promise<void> {
    if (connection === undefined) return;
    onStaleRef.current();
    try {
      const { mismatch } = await readInto(connection, context);
      say(
        mismatch
          ? "実機のfull readは完了したが、definitionまたはUIDがworkspaceと異なる。desired stateは上書きしていない"
          : "実機のfull readが完了した",
      );
    } catch (error) {
      say(errorMessage(error));
    } finally {
      setProgress(undefined);
    }
  }

  return {
    connection,
    read,
    definitionDigest: definitionDigestValue,
    lastReadRoundTrips,
    readAt,
    reading,
    acquire,
    connect,
    disconnect,
    fullRead,
    adoptRead,
    readInto,
    readDevice,
  };
}
