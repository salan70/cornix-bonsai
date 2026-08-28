/** Browserのファイル選択を扱う小さなadapter。workspaceのfilesystemとは分離する。 */

interface OpenFileHandle {
  getFile(): Promise<File>;
}

interface BrowserFilePicker {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: readonly {
      description: string;
      accept: Readonly<Record<string, readonly string[]>>;
    }[];
  }) => Promise<readonly OpenFileHandle[]>;
}

/** @doc docs/specs/ui.md#browser-import-export */
export async function pickVilText(): Promise<string> {
  const picker = (globalThis as typeof globalThis & BrowserFilePicker).showOpenFilePicker;
  if (picker !== undefined) {
    const handles = await picker({
      multiple: false,
      types: [{ description: "Vial keymap", accept: { "application/json": [".vil"] } }],
    });
    const handle = handles[0];
    if (handle === undefined) throw new Error(".vilファイルが選択されなかった");
    return await (await handle.getFile()).text();
  }

  if (typeof document === "undefined") throw new Error("このbrowserはファイル選択に対応していない");
  return new Promise<string>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".vil,application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file === undefined) reject(new Error(".vilファイルが選択されなかった"));
      else void file.text().then(resolve, reject);
    });
    input.addEventListener("cancel", () => reject(new Error(".vilファイルが選択されなかった")));
    input.click();
  });
}
