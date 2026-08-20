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

export function backupPath(date = new Date()): string {
  const stamp = date.toISOString().replace(/[:.]/g, "");
  return `${WORKSPACE_LAYOUT.backups}/${stamp}.vil`;
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
