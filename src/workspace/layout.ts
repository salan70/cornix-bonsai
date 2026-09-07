/**
 * workspace の配置と、content-addressed な definition の名前を扱う。
 *
 * Browser / CLI の adapter が同じ規則を使うための副作用のない境界であり、
 * `src/core/` の意味モデルからは参照しない。
 */

import { canonicalDefinitionText } from "../core/definition/identity.ts";
import type { WorkspaceFileStore } from "./types.ts";

/** @doc docs/specs/workspace-cli.md#配置 */
export const WORKSPACE_LAYOUT = {
  keymap: "keymap.yaml",
  /** MacBook 内蔵キーボードの desired state。`keymap.yaml` とは別 document（ADR 0022）。 */
  macKeymap: "mac-keyboard.yaml",
  definitions: "cornix/definitions",
  labels: "cornix/labels.yaml",
  acknowledgements: "cornix/acknowledgements.json",
  backups: "cornix/backups",
  latestBackup: "cornix/backups/latest.vil",
  generated: "cornix/generated",
} as const;

export function definitionPath(digest: string): string {
  if (!/^[0-9a-f]{64}$/i.test(digest)) {
    throw new Error(`definition digest が SHA-256 ではない: ${digest}`);
  }
  return `${WORKSPACE_LAYOUT.definitions}/${digest.slice(0, 16)}.json`;
}

/**
 * definition の digest。CLI import・実機 read・binding 検証はすべてこれを通す。
 *
 * @doc docs/specs/workspace-cli.md#definitiondigest
 */
export async function definitionDigest(text: string, provider: Sha256Provider): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalDefinitionText(text)), provider);
}

/** @doc docs/specs/workspace-cli.md#readdefinitionbinding */
export async function readDefinitionBinding(
  store: Pick<WorkspaceFileStore, "readBytes">,
  path: string,
  digest: string,
  provider: Sha256Provider,
): Promise<string> {
  const expectedPath = definitionPath(digest);
  if (path !== expectedPath) {
    throw new Error(`definition binding pathがdigestと一致しない: ${path}`);
  }
  const bytes = await store.readBytes(path);
  if (bytes === undefined) throw new Error(`${path} が見つからない`);
  const text = new TextDecoder().decode(bytes);
  const actualDigest = await definitionDigest(text, provider);
  if (actualDigest !== digest) {
    throw new Error(`definition digestが一致しない: expected=${digest} actual=${actualDigest}`);
  }
  return text;
}

/**
 * backup の path。既定は Vial の `.vil`。
 *
 * MacBook 内蔵キーボードの backup は `karabiner.json` 1 ファイルなので、
 * 接頭辞と拡張子を差し替えて同じ場所へ置く（ADR 0022）。
 */
export function backupPath(
  date = new Date(),
  options: { readonly prefix?: string; readonly extension?: string } = {},
): string {
  const stamp = date.toISOString().replace(/[:.]/g, "");
  const prefix = options.prefix ?? "";
  const extension = options.extension ?? "vil";
  return `${WORKSPACE_LAYOUT.backups}/${prefix}${stamp}.${extension}`;
}

export function generatedPath(name: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(name) || name === "." || name === "..") {
    throw new Error(`generated file name が不正: ${name}`);
  }
  return `${WORKSPACE_LAYOUT.generated}/${name}`;
}

export function isTracked(path: string): boolean {
  return (
    !path.startsWith(`${WORKSPACE_LAYOUT.backups}/`) &&
    !path.startsWith(`${WORKSPACE_LAYOUT.generated}/`)
  );
}

export interface Sha256Provider {
  readonly subtle: {
    digest(algorithm: "SHA-256", data: ArrayBuffer | ArrayBufferView): Promise<ArrayBuffer>;
  };
}

export async function sha256Hex(
  bytes: ArrayBuffer | ArrayBufferView,
  provider: Sha256Provider,
): Promise<string> {
  const digest = await provider.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
