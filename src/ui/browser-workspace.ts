import { sha256Hex } from "../workspace/layout.ts";
import type { WorkspaceFileStore } from "../workspace/types.ts";

interface DirectoryHandleLike {
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  queryPermission?(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
}
interface FileHandleLike {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }>;
}

const DB_NAME = "cornix-bonsai";
const DB_STORE = "workspace";
const DB_KEY = "directory";

export class BrowserWorkspaceStore implements WorkspaceFileStore {
  readonly directory: DirectoryHandleLike;

  constructor(directory: DirectoryHandleLike) {
    this.directory = directory;
  }

  async readText(path: string): Promise<string | undefined> {
    const file = await this.readFile(path);
    return file === undefined ? undefined : new TextDecoder().decode(file.bytes);
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeBytes(path, new TextEncoder().encode(text));
  }

  async readBytes(path: string): Promise<Uint8Array | undefined> {
    const file = await this.readFile(path);
    return file?.bytes;
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    const { directory, name } = await this.parent(path, true);
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  async stat(
    path: string,
  ): Promise<{ readonly modifiedAt: number; readonly contentHash?: string } | undefined> {
    const file = await this.readFile(path);
    if (file === undefined) return undefined;
    return {
      modifiedAt: file.file.lastModified,
      contentHash: await sha256Hex(file.bytes, globalThis.crypto),
    };
  }

  async ensureDirectory(path: string): Promise<void> {
    await this.parent(`${path}/.keep`, true);
  }

  private async readFile(
    path: string,
  ): Promise<{ readonly file: File; readonly bytes: Uint8Array } | undefined> {
    try {
      const { directory, name } = await this.parent(path, false);
      const file = await (await directory.getFileHandle(name)).getFile();
      return { file, bytes: new Uint8Array(await file.arrayBuffer()) };
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  private async parent(
    path: string,
    create: boolean,
  ): Promise<{ readonly directory: DirectoryHandleLike; readonly name: string }> {
    const segments = path.split("/").filter(Boolean);
    const name = segments.pop();
    if (name === undefined) throw new Error(`workspace path が空: ${path}`);
    let directory = this.directory;
    for (const segment of segments)
      directory = await directory.getDirectoryHandle(segment, { create });
    return { directory, name };
  }
}

/** @doc docs/specs/ui.md#workspace入口 */
export async function pickWorkspace(): Promise<BrowserWorkspaceStore> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (options?: { mode?: string }) => Promise<DirectoryHandleLike>;
    }
  ).showDirectoryPicker;
  if (picker === undefined) throw new Error("このbrowserはFile System Access APIに対応していない");
  const directory = await picker({ mode: "readwrite" });
  await saveDirectory(directory);
  return new BrowserWorkspaceStore(directory);
}

/** @doc docs/specs/ui.md#workspace入口 */
export async function restoreWorkspace(): Promise<BrowserWorkspaceStore | undefined> {
  const directory = await loadDirectory();
  if (directory === undefined) return undefined;
  const query =
    directory.queryPermission === undefined
      ? "granted"
      : await directory.queryPermission({ mode: "readwrite" });
  if (query !== "granted") return undefined;
  return new BrowserWorkspaceStore(directory);
}

async function saveDirectory(directory: DirectoryHandleLike): Promise<void> {
  const database = await openDb();
  await request(database, "readwrite", (store) => store.put(directory, DB_KEY));
}

async function loadDirectory(): Promise<DirectoryHandleLike | undefined> {
  const database = await openDb();
  return request<DirectoryHandleLike | undefined>(database, "readonly", (store) =>
    store.get(DB_KEY),
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDBを開けない"));
  });
}

function request<T = undefined>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, mode);
    const result = operation(transaction.objectStore(DB_STORE));
    result.onsuccess = () => resolve(result.result as T);
    result.onerror = () => reject(result.error ?? new Error("IndexedDB操作に失敗"));
  });
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "TypeMismatchError")
  );
}
