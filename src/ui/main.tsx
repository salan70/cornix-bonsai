import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { diffDocuments, type DiffEntry } from "../core/diff/diff.ts";
import { createKeycodeTable } from "../core/keycode/table.ts";
import { describeKeycode } from "../core/diff/describe.ts";
import { setEncoderAssignment, setKeyAssignment } from "../core/model/edit.ts";
import { buildKeymapView } from "../core/model/keymap-view.ts";
import { analyzeReachability } from "../core/validation/reachability.ts";
import { collectReferenceUsage } from "../core/validation/reference-usage.ts";
import { classifyKeycode } from "../core/validation/keycode-vocabulary.ts";
import {
  abortApply,
  createApplyPlan,
  createValidatedApplyInput,
  confirmApply,
  recordVerifyResult,
  type ApplyState,
} from "../core/apply/plan.ts";
import type { WriteTarget } from "../core/apply/targets.ts";
import { evaluateApplyGate } from "../core/validation/gate.ts";
import { validateApplyKeymap, validateKeymap } from "../core/validation/validate.ts";
import { createDiagnostic } from "../core/validation/types.ts";
import { keyCenter, parseDefinition } from "../core/definition/parse.ts";
import { canonicalDefinitionText } from "../core/definition/identity.ts";
import { parseKeymapYaml } from "../core/keymap-yaml/parse.ts";
import { serializeKeymapYaml } from "../core/keymap-yaml/serialize.ts";
import { parseVil } from "../core/vil/parse.ts";
import { serializeVil } from "../core/vil/serialize.ts";
import { DeviceIoError } from "../device/protocol.ts";
import { WebHidAdapter, type ReadDeviceResult, type WebHidConnection } from "../device/webhid.ts";
import {
  backupPath,
  definitionDigest,
  definitionPath,
  readDefinitionBinding,
  WORKSPACE_LAYOUT,
} from "../workspace/layout.ts";
import {
  EMPTY_LABELS,
  layerLabel,
  parseLabelsYaml,
  type WorkspaceLabels,
} from "../workspace/labels.ts";
import { parseAcknowledgements, serializeAcknowledgements } from "../workspace/acknowledgements.ts";
import { CORNIX_LP_V112_SETTINGS, settingLabel } from "../workspace/settings.ts";
import { createSaveQueue, type SaveQueue } from "../workspace/save-queue.ts";
import type { WorkspaceConflictToken } from "../workspace/types.ts";
import { BrowserWorkspaceStore, pickWorkspace, restoreWorkspace } from "./browser-workspace.ts";
import "./styles.css";

type Tab = "Keymap" | "Overview" | "Behaviors" | "References";
type Selection =
  | { readonly kind: "key"; readonly row: number; readonly col: number }
  | { readonly kind: "encoder"; readonly index: number; readonly direction: "ccw" | "cw" };
interface WorkspaceModel {
  readonly store: BrowserWorkspaceStore;
  readonly document: ReturnType<typeof parseKeymapYaml>["document"];
  readonly binding: ReturnType<typeof parseKeymapYaml>["binding"];
  readonly definition: ReturnType<typeof parseDefinition>;
  readonly labels: WorkspaceLabels;
  readonly acknowledged: readonly string[];
  readonly token: WorkspaceConflictToken | undefined;
}

function App(): React.JSX.Element {
  const [workspace, setWorkspace] = useState<WorkspaceModel | undefined>();
  const [tab, setTab] = useState<Tab>("Keymap");
  const [layer, setLayer] = useState(0);
  const [selection, setSelection] = useState<Selection | undefined>();
  const [device, setDevice] = useState<WebHidConnection | undefined>();
  const [deviceRead, setDeviceRead] = useState<ReadDeviceResult | undefined>();
  const [deviceDefinitionDigest, setDeviceDefinitionDigest] = useState<string | undefined>();
  const [status, setStatus] = useState("workspaceを選択してください");
  const [progress, setProgress] = useState<string | undefined>();
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyState, setApplyState] = useState<ApplyState | undefined>();
  const applyCancellation = useRef(false);
  const saveQueue = useRef<SaveQueue | undefined>(undefined);

  function adoptWorkspace(model: WorkspaceModel): void {
    saveQueue.current = createSaveQueue({
      store: model.store,
      path: WORKSPACE_LAYOUT.keymap,
      token: model.token,
      onSaved: () => setStatus("keymap.yamlへ保存した"),
      onError: (error) => setStatus(message(error)),
    });
    setWorkspace(model);
    setAcknowledged(model.acknowledged);
  }

  useEffect(() => {
    void restoreWorkspace().then((store) =>
      store === undefined
        ? undefined
        : loadStore(store)
            .then((model) => adoptWorkspace(model))
            .catch((error) => setStatus(message(error))),
    );
  }, []);

  const validation = useMemo(
    () =>
      workspace === undefined
        ? undefined
        : validateKeymap(workspace.document, workspace.definition),
    [workspace],
  );
  const view = useMemo(
    () =>
      workspace === undefined
        ? undefined
        : buildKeymapView(workspace.document, workspace.definition),
    [workspace],
  );
  const changed = useMemo(() => {
    if (workspace === undefined || deviceRead === undefined) return [];
    return diffDocuments(deviceRead.document, workspace.document, workspace.definition, {
      settings: { labels: CORNIX_LP_V112_SETTINGS },
    }).entries;
  }, [deviceRead, workspace]);
  const applyGate = useMemo(() => {
    if (workspace === undefined || deviceRead === undefined || changed.length === 0)
      return undefined;
    const targets = changed
      .map(toWriteTarget)
      .filter((target): target is WriteTarget => target !== undefined);
    const validationResult = validateApplyKeymap(
      workspace.document,
      workspace.definition,
      {
        keyboardUid: deviceRead.keyboardUid,
        capacities: deviceRead.capacities,
        supportedQsids: deviceRead.supportedQsids,
      },
      { path: workspace.binding.definitionPath, digest: workspace.binding.definitionDigest },
      targets,
    );
    const definitionMismatch = deviceDefinitionDigest !== workspace.binding.definitionDigest;
    const diagnostics = definitionMismatch
      ? Object.freeze([
          ...validationResult.evidence.diagnostics,
          createDiagnostic(
            "compatibility/definition-mismatch",
            "error",
            { kind: "document" },
            deviceDefinitionDigest === undefined
              ? "実機definitionのdigestを取得できていないためApplyできない"
              : `実機definitionがworkspace bindingと異なる（workspace=${workspace.binding.definitionDigest} device=${deviceDefinitionDigest}）`,
            {
              workspace: workspace.binding.definitionDigest,
              device: deviceDefinitionDigest ?? "missing",
            },
          ),
        ])
      : validationResult.evidence.diagnostics;
    if (targets.length === changed.length)
      return evaluateApplyGate({ ...validationResult.evidence, diagnostics }, acknowledged);
    const unsupported = createDiagnostic(
      "apply/unsupported-change",
      "error",
      { kind: "document" },
      `実機write未対応の差分が${changed.length - targets.length}件あるためApplyできない`,
      { count: changed.length - targets.length },
    );
    return evaluateApplyGate(
      {
        ...validationResult.evidence,
        diagnostics: Object.freeze([...diagnostics, unsupported]),
      },
      acknowledged,
    );
  }, [acknowledged, changed, deviceDefinitionDigest, deviceRead, workspace]);

  async function openWorkspace(): Promise<void> {
    try {
      const store = await pickWorkspace();
      adoptWorkspace(await loadStore(store));
      setStatus("workspaceを開いた");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function reload(): Promise<void> {
    if (workspace === undefined) return;
    try {
      adoptWorkspace(await loadStore(workspace.store));
      setStatus("keymap.yamlを再読み込みした");
    } catch (error) {
      setStatus(message(error));
    }
  }

  /**
   * 編集を state へ即時反映し、filesystem への書き込みは直列 queue へ渡す。
   *
   * 入力ごとに非同期 save を並行させると、自分の write を外部変更と誤検出したり
   * write 順が入れ替わって古い内容が残ったりする。write の順序と token の更新は
   * `createSaveQueue` だけが持つ。
   */
  function save(document = workspace?.document): void {
    if (workspace === undefined || document === undefined) return;
    setWorkspace({ ...workspace, document });
    try {
      saveQueue.current?.enqueue(serializeKeymapYaml(document, workspace.binding));
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function connect(): Promise<void> {
    try {
      const adapter = new WebHidAdapter();
      const next = (await adapter.reacquire()) ?? (await adapter.request());
      if (next === undefined) {
        setStatus("Vial deviceが選択されなかった");
        return;
      }
      setDeviceRead(undefined);
      setDeviceDefinitionDigest(undefined);
      setApplyOpen(false);
      setApplyState(undefined);
      setDevice(next);
      setStatus("接続済み");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function disconnect(): Promise<void> {
    try {
      await device?.close();
      setDevice(undefined);
      setDeviceRead(undefined);
      setDeviceDefinitionDigest(undefined);
      setApplyOpen(false);
      setApplyState(undefined);
      setStatus("切断した");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function readDevice(): Promise<void> {
    if (device === undefined) return;
    setApplyOpen(false);
    setApplyState(undefined);
    try {
      const result = await device.read((event) => setProgress(`${event.label} (${event.count})`));
      // CLI importと同じcanonical規則でdigestを取る。整形の違いだけで
      // workspace bindingとmismatchにならないようにするため。
      const definitionText = canonicalDefinitionText(result.definitionText);
      const digest = await definitionDigest(definitionText, globalThis.crypto);
      let mismatch = false;
      if (workspace !== undefined) {
        const path = definitionPath(digest);
        await workspace.store.writeText(path, definitionText);
        if (
          workspace.binding.definitionDigest !== digest ||
          workspace.document.uid !== result.keyboardUid
        ) {
          mismatch = true;
        }
      }
      setDeviceDefinitionDigest(digest);
      setDeviceRead(result);
      setStatus(
        mismatch
          ? "実機のfull readは完了したが、definitionまたはUIDがworkspaceと異なる。desired stateは上書きしていない"
          : "実機のfull readが完了した",
      );
    } catch (error) {
      setStatus(message(error));
    } finally {
      setProgress(undefined);
    }
  }

  function createConfirmationState(
    gate: NonNullable<typeof applyGate>,
    snapshot: ReadDeviceResult["snapshot"],
  ): ApplyState | undefined {
    if (!gate.allowed) return undefined;
    const input = createValidatedApplyInput(gate, snapshot);
    const plan = createApplyPlan(input);
    return { phase: "awaitingConfirmation", plan };
  }

  async function openApply(): Promise<void> {
    if (
      workspace === undefined ||
      device === undefined ||
      deviceRead === undefined ||
      changed.length === 0
    )
      return;
    try {
      applyCancellation.current = false;
      const backupText = serializeVil(deviceRead.document);
      await workspace.store.writeText(backupPath(), backupText);
      await workspace.store.writeText(WORKSPACE_LAYOUT.latestBackup, backupText);
      const gate = applyGate;
      if (gate === undefined) return;
      if (!gate.allowed) {
        setApplyOpen(true);
        setApplyState(undefined);
        return;
      }
      setApplyOpen(true);
      setApplyState(createConfirmationState(gate, deviceRead.snapshot));
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function apply(): Promise<void> {
    if (
      workspace === undefined ||
      device === undefined ||
      deviceRead === undefined ||
      applyState?.phase !== "awaitingConfirmation"
    )
      return;
    try {
      applyCancellation.current = false;
      const gate = applyGate;
      if (gate === undefined) return;
      const input = createValidatedApplyInput(gate, deviceRead.snapshot);
      const plan = createApplyPlan(input);
      const state = confirmApply(plan, applyState.plan.fingerprint);
      if (applyCancellation.current) {
        setStatus("Applyを中断した。writeは開始していない");
        return;
      }
      setApplyState(state);
      let current = state;
      for (const operation of plan.operations) {
        if (current.phase !== "writing") break;
        setProgress(`write ${current.cursor + 1} / ${plan.operations.length}`);
        try {
          const observed = await device.writeAndVerify(operation.target, operation.after, (event) =>
            setProgress(`${event.label} (${event.count})`),
          );
          current = recordVerifyResult(current, observed);
        } catch (error) {
          if (!(error instanceof DeviceIoError)) throw error;
          current = abortApply(
            current,
            error.reason === "timeout"
              ? "timeout"
              : error.reason === "disconnected"
                ? "disconnected"
                : "protocol-error",
          );
        }
        if (applyCancellation.current && current.phase === "writing") {
          current = abortApply(current, "user-cancelled");
        }
        setApplyState(current);
        if (current.phase === "aborted") break;
      }
      setStatus(
        current.phase === "completed"
          ? "実機に反映した（電源断後の永続化は未確認）"
          : "Applyを中断した。再接続後にfull readからやり直してください",
      );
    } catch (error) {
      setStatus(message(error));
    } finally {
      setProgress(undefined);
    }
  }

  function cancelApply(): void {
    applyCancellation.current = true;
    if (applyState?.phase === "writing") {
      setApplyState((current) =>
        current?.phase === "writing" ? abortApply(current, "user-cancelled") : current,
      );
      setStatus("Applyを中断した。進行中のI/Oの完了を待っています");
      return;
    }
    setApplyOpen(false);
  }

  async function restoreBackup(): Promise<void> {
    if (workspace === undefined) return;
    try {
      const text = await workspace.store.readText(WORKSPACE_LAYOUT.latestBackup);
      if (text === undefined) throw new Error("最新のbackupが見つからない");
      const document = parseVil(text);
      setWorkspace({ ...workspace, document });
      setStatus("最新backupをdesiredへ読み込んだ。内容を確認してApplyまたは保存してください");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function acknowledge(ids: readonly string[]): Promise<boolean> {
    if (workspace === undefined) return false;
    try {
      const next = [...new Set(ids)].sort();
      await workspace.store.writeText(
        WORKSPACE_LAYOUT.acknowledgements,
        serializeAcknowledgements(next),
      );
      setAcknowledged(next);
      setWorkspace({ ...workspace, acknowledged: next });
      return true;
    } catch (error) {
      setStatus(message(error));
      return false;
    }
  }

  async function acknowledgeForApply(ids: readonly string[]): Promise<void> {
    if (!(await acknowledge(ids))) return;
    const gate = applyGate;
    if (gate === undefined || deviceRead === undefined) {
      setApplyState(undefined);
      return;
    }
    const nextAcknowledged = [...new Set(ids)].sort();
    const nextGate = evaluateApplyGate(gate.evidence, nextAcknowledged);
    if (!nextGate.allowed) {
      setApplyState(undefined);
      return;
    }
    try {
      setApplyState(createConfirmationState(nextGate, deviceRead.snapshot));
    } catch (error) {
      setApplyState(undefined);
      setStatus(message(error));
    }
  }

  function editKey(keycode: string): void {
    if (workspace === undefined || selection?.kind !== "key") return;
    try {
      save(
        setKeyAssignment(
          workspace.document,
          { layer, row: selection.row, col: selection.col },
          keycode,
        ),
      );
    } catch (error) {
      setStatus(message(error));
    }
  }

  function editEncoder(keycode: string): void {
    if (workspace === undefined || selection?.kind !== "encoder") return;
    try {
      save(
        setEncoderAssignment(
          workspace.document,
          {
            layer,
            index: selection.index,
            direction: selection.direction === "ccw" ? 0 : 1,
          },
          keycode,
        ),
      );
    } catch (error) {
      setStatus(message(error));
    }
  }

  function editTapDance(index: number, field: number, value: string): void {
    if (workspace === undefined) return;
    const current = workspace.document.tapDance[index];
    if (current === undefined || field < 0 || field > 4) return;
    const next = [...current] as [string, string, string, string, number];
    if (field === 4) {
      const timeout = Number(value);
      if (!Number.isInteger(timeout) || timeout < 0 || timeout > 0xffff) {
        setStatus("Tap Dance timeoutは0〜65535の整数が必要");
        return;
      }
      next[4] = timeout;
    } else next[field] = value;
    save({
      ...workspace.document,
      tapDance: workspace.document.tapDance.map((entry, entryIndex) =>
        entryIndex === index ? next : entry,
      ),
    });
  }

  function editCombo(index: number, field: number, value: string): void {
    if (workspace === undefined) return;
    const current = workspace.document.combo[index];
    if (current === undefined || field < 0 || field > 4) return;
    const next = [...current] as [string, string, string, string, string];
    next[field] = value;
    save({
      ...workspace.document,
      combo: workspace.document.combo.map((entry, entryIndex) =>
        entryIndex === index ? next : entry,
      ),
    });
  }

  function editSetting(qsid: number, value: string): void {
    if (workspace === undefined) return;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) {
      setStatus("settingは0〜65535の整数が必要");
      return;
    }
    save({
      ...workspace.document,
      settings: { ...workspace.document.settings, [String(qsid)]: parsed },
    });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="brand-mark">🌱</span>
          <strong>Cornix Bonsai</strong>
          <span className="path">{workspace?.store.directory.name ?? "workspace未選択"}</span>
        </div>
        <div className="header-actions">
          <span className="device-summary" aria-live="polite">
            {device === undefined ? "device未接続" : `device: ${device.info.productName}`}
            {deviceRead === undefined || workspace === undefined ? null : (
              <>
                {` / current UID ${deviceRead.keyboardUid} / desired UID ${workspace.document.uid}`}
                {` / definition ${deviceDefinitionDigest === workspace.binding.definitionDigest ? "一致" : "不一致"}`}
              </>
            )}
          </span>
          <button onClick={() => void openWorkspace()}>Workspace</button>
          <button onClick={() => void reload()} disabled={workspace === undefined}>
            再読込
          </button>
          <button onClick={() => void restoreBackup()} disabled={workspace === undefined}>
            backup復元
          </button>
          <button onClick={() => void connect()}>接続</button>
          <button onClick={() => void disconnect()} disabled={device === undefined}>
            切断
          </button>
          <button onClick={() => void readDevice()} disabled={device === undefined}>
            実機read
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="main tabs">
        {(["Keymap", "Overview", "Behaviors", "References"] as const).map((name) => (
          <button className={tab === name ? "active" : ""} onClick={() => setTab(name)} key={name}>
            {name}
          </button>
        ))}
      </nav>
      {workspace === undefined ? (
        <main className="empty-state">
          <h1>workspaceから始める</h1>
          <p>keymap.yamlを含むディレクトリを開くか、実機readで初期状態を取得します。</p>
          <button className="primary" onClick={() => void openWorkspace()}>
            Workspaceを開く
          </button>
        </main>
      ) : (
        <main className="main-content">
          {tab === "Keymap" && view !== undefined ? (
            <KeymapTab
              view={view}
              definition={workspace.definition}
              layer={layer}
              setLayer={setLayer}
              selection={selection}
              setSelection={setSelection}
              labels={workspace.labels}
              onEditKey={editKey}
              onEditEncoder={editEncoder}
            />
          ) : null}
          {tab === "Overview" && (
            <Overview document={workspace.document} labels={workspace.labels} />
          )}
          {tab === "Behaviors" && (
            <Behaviors
              document={workspace.document}
              onTapDance={editTapDance}
              onCombo={editCombo}
              onSetting={editSetting}
            />
          )}
          {tab === "References" && (
            <Diagnostics
              diagnostics={validation?.diagnostics ?? []}
              document={workspace.document}
            />
          )}
        </main>
      )}
      <footer className="status-bar">
        <span>⛔ {validation?.summary.error ?? 0}</span>
        <span>⚠ {validation?.summary.warning ?? 0}</span>
        <span>ⓘ {validation?.summary.information ?? 0}</span>
        <span className="status-message">{progress ?? status}</span>
        <button
          onClick={() => void openApply()}
          disabled={changed.length === 0 || deviceRead === undefined}
        >
          Apply ({changed.length})
        </button>
      </footer>
      {applyOpen && (
        <ApplyDialog
          state={applyState}
          changed={changed}
          gate={applyGate}
          onAcknowledge={(ids) => void acknowledgeForApply(ids)}
          acknowledged={acknowledged}
          onCancel={cancelApply}
          onApply={() => void apply()}
        />
      )}
    </div>
  );
}

function KeymapTab({
  view,
  definition,
  layer,
  setLayer,
  selection,
  setSelection,
  labels,
  onEditKey,
  onEditEncoder,
}: {
  view: ReturnType<typeof buildKeymapView>;
  definition: ReturnType<typeof parseDefinition>;
  layer: number;
  setLayer: (value: number) => void;
  selection: Selection | undefined;
  setSelection: (value: Selection | undefined) => void;
  labels: WorkspaceLabels;
  onEditKey: (value: string) => void;
  onEditEncoder: (value: string) => void;
}): React.JSX.Element {
  const table = createKeycodeTable(definition, view.capacities);
  const editorRef = useRef<HTMLInputElement>(null);
  const selectedButtonRef = useRef<HTMLButtonElement>(null);
  const selectedKey =
    selection?.kind === "key"
      ? view.keys.find(
          (key) =>
            key.position.layer === layer &&
            key.position.row === selection.row &&
            key.position.col === selection.col,
        )
      : undefined;
  const selectedEncoder =
    selection?.kind === "encoder"
      ? view.encoders.find(
          (encoder) =>
            encoder.layer === layer &&
            encoder.index === selection.index &&
            encoder.direction === selection.direction,
        )
      : undefined;

  function selectLayer(nextLayer: number): void {
    setLayer(nextLayer);
    setSelection(undefined);
  }

  function focusEditor(): void {
    editorRef.current?.focus();
    editorRef.current?.select();
  }

  function selectKey(key: (typeof view.keys)[number]): void {
    setSelection({ kind: "key", row: key.position.row, col: key.position.col });
    window.requestAnimationFrame(() => selectedButtonRef.current?.focus());
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    key: (typeof view.keys)[number],
  ): void {
    if (event.key === "Enter") {
      event.preventDefault();
      focusEditor();
      return;
    }
    if (!event.key.startsWith("Arrow")) return;
    const next = moveKey(view, key, event.key);
    if (next === undefined) return;
    event.preventDefault();
    selectKey(next);
  }

  const input = selectedKey ?? selectedEncoder;
  const inputDisplay =
    input === undefined ? undefined : keycodeDisplay(input.keycode, labels, table);
  return (
    <section className="keymap-layout">
      <div className="editor-pane">
        <div className="layer-tabs">
          {Array.from({ length: view.capacities.layerCount }, (_, index) => (
            <button
              className={layer === index ? "active" : ""}
              onClick={() => selectLayer(index)}
              key={index}
            >
              {layerLabel(labels, index)}
            </button>
          ))}
        </div>
        <div className="key-grid">
          {view.keys
            .filter((key) => key.position.layer === layer)
            .map((key) => (
              <button
                ref={
                  selection?.kind === "key" &&
                  selection.row === key.position.row &&
                  selection.col === key.position.col
                    ? selectedButtonRef
                    : undefined
                }
                className={`keycap ${selectedKey?.position.row === key.position.row && selectedKey.position.col === key.position.col ? "selected" : ""}`}
                style={{
                  left: `${key.physical.x * 56}px`,
                  top: `${key.physical.y * 56}px`,
                  width: `${key.physical.width * 54}px`,
                  height: `${key.physical.height * 54}px`,
                  transform: `rotate(${key.physical.rotationAngle}deg)`,
                }}
                onClick={() => selectKey(key)}
                onKeyDown={(event) => handleKeyDown(event, key)}
                key={`${key.position.row}:${key.position.col}`}
              >
                {renderKeycode(keycodeDisplay(key.keycode, labels, table))}
              </button>
            ))}
        </div>
        <div className="encoder-strip" aria-label="encoders">
          {[
            ...new Set(
              view.encoders
                .filter((encoder) => encoder.layer === layer)
                .map((encoder) => encoder.index),
            ),
          ]
            .sort((left, right) => left - right)
            .map((index) => (
              <fieldset className="encoder-slot" key={index}>
                <legend>Encoder {index}</legend>
                {(["ccw", "cw"] as const).map((direction) => {
                  const encoder = view.encoders.find(
                    (candidate) =>
                      candidate.layer === layer &&
                      candidate.index === index &&
                      candidate.direction === direction,
                  );
                  if (encoder === undefined) return null;
                  const isSelected =
                    selection?.kind === "encoder" &&
                    selection.index === index &&
                    selection.direction === direction;
                  return (
                    <button
                      ref={isSelected ? selectedButtonRef : undefined}
                      className={`encoder-key ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelection({ kind: "encoder", index, direction })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          focusEditor();
                        }
                      }}
                      key={direction}
                    >
                      {renderKeycode(
                        keycodeDisplay(encoder.keycode, labels, table),
                        direction === "ccw" ? "↺" : "↻",
                      )}
                    </button>
                  );
                })}
              </fieldset>
            ))}
        </div>
      </div>
      <aside className="side-panel">
        <h2>選択中の入力</h2>
        {input === undefined ? (
          <p>盤面またはencoderから入力を選択してください。</p>
        ) : (
          <>
            <p className="muted">
              {selectedKey === undefined
                ? `layer ${layer} / encoder ${selectedEncoder?.index} / ${selectedEncoder?.direction}`
                : `layer ${layer} / row ${selectedKey.position.row} / col ${selectedKey.position.col}`}
            </p>
            <label>
              raw keycode
              <input
                ref={editorRef}
                data-keymap-editor
                value={input.keycode}
                onChange={(event) =>
                  selectedKey === undefined
                    ? onEditEncoder(event.target.value)
                    : onEditKey(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  event.currentTarget.blur();
                  selectedButtonRef.current?.focus();
                }}
              />
            </label>
            <p className="detail">
              {describeKeycode(input.keycode, table)}
              {inputDisplay?.role === undefined ? null : ` · ${inputDisplay.role}`}
            </p>
          </>
        )}
      </aside>
    </section>
  );
}

function renderKeycode(display: KeycodeDisplay, prefix = ""): React.JSX.Element {
  return (
    <>
      <span>
        {prefix}
        {display.primary}
      </span>
      {display.role === undefined ? null : <small>{display.role}</small>}
    </>
  );
}

interface KeycodeDisplay {
  readonly primary: string;
  readonly role?: string;
}

function keycodeDisplay(
  keycode: string,
  labels: WorkspaceLabels,
  table: ReturnType<typeof createKeycodeTable>,
): KeycodeDisplay {
  const lexeme = classifyKeycode(keycode);
  switch (lexeme.kind) {
    case "none":
      return { primary: "—", role: "No action" };
    case "transparent":
      return { primary: "↓", role: "Transparent" };
    case "basic":
      return { primary: lexeme.name.replace(/^KC_/, "") };
    case "modified":
      return {
        primary: keycodeDisplay(lexeme.inner, labels, table).primary,
        role: modifierSymbol(lexeme.modifier),
      };
    case "modTap":
      return {
        primary: keycodeDisplay(lexeme.inner, labels, table).primary,
        role: `hold ${modifierSymbol(lexeme.modifier)}`,
      };
    case "layerSwitch":
      return {
        primary:
          lexeme.inner === undefined
            ? layerLabel(labels, lexeme.layer)
            : keycodeDisplay(lexeme.inner, labels, table).primary,
        role:
          lexeme.inner === undefined
            ? layerActionLabel(lexeme.action)
            : `hold ${layerLabel(labels, lexeme.layer)}`,
      };
    case "tapDance":
      return { primary: "Tap Dance", role: `#${lexeme.index}` };
    case "macro":
      return { primary: "Macro", role: `#${lexeme.index}` };
    case "custom": {
      const resolved = table.resolve(keycode);
      return resolved.kind === "custom" ? { primary: resolved.shortName } : { primary: keycode };
    }
    default:
      return { primary: keycode };
  }
}

function modifierSymbol(modifier: string): string {
  if (["LGUI", "RGUI", "SGUI", "LCMD", "RCMD", "SCMD", "SWIN"].includes(modifier)) return "⌘";
  if (["LALT", "RALT", "LAG", "RAG"].includes(modifier)) return "⌥";
  if (["LCTL", "RCTL", "LCG", "RCG", "LCA", "RCA"].includes(modifier)) return "⌃";
  if (["LSFT", "RSFT", "LSA", "RSA"].includes(modifier)) return "⇧";
  if (modifier === "HYPR") return "⌘⌥⌃⇧";
  if (modifier === "MEH") return "⌥⌃⇧";
  return modifier;
}

function layerActionLabel(action: string): string {
  switch (action) {
    case "momentary":
    case "layerTap":
    case "layerMod":
      return "hold";
    case "toggle":
      return "toggle";
    case "to":
      return "stay";
    case "tapToggle":
      return "tap-toggle";
    case "default":
      return "default";
    case "oneShot":
      return "one-shot";
    default:
      return action;
  }
}

function moveKey(
  view: ReturnType<typeof buildKeymapView>,
  current: (typeof view.keys)[number],
  direction: string,
): (typeof view.keys)[number] | undefined {
  const [x, y] = keyCenter(current.physical);
  const candidates = view.keys.filter(
    (key) => key.position.layer === current.position.layer && key !== current,
  );
  const filtered = candidates.filter((candidate) => {
    const [candidateX, candidateY] = keyCenter(candidate.physical);
    if (direction === "ArrowLeft") return candidateX < x;
    if (direction === "ArrowRight") return candidateX > x;
    if (direction === "ArrowUp") return candidateY < y;
    if (direction === "ArrowDown") return candidateY > y;
    return false;
  });
  return filtered.sort(
    (left, right) => moveScore(left, x, y, direction) - moveScore(right, x, y, direction),
  )[0];
}

function moveScore(
  candidate: ReturnType<typeof buildKeymapView>["keys"][number],
  x: number,
  y: number,
  direction: string,
): number {
  const [candidateX, candidateY] = keyCenter(candidate.physical);
  const major =
    direction === "ArrowLeft" || direction === "ArrowRight"
      ? Math.abs(candidateX - x)
      : Math.abs(candidateY - y);
  const minor =
    direction === "ArrowLeft" || direction === "ArrowRight"
      ? Math.abs(candidateY - y)
      : Math.abs(candidateX - x);
  return major + minor * 2;
}

function Overview({
  document,
  labels,
}: {
  document: ReturnType<typeof parseKeymapYaml>["document"];
  labels: WorkspaceLabels;
}): React.JSX.Element {
  return (
    <section className="panel">
      <h1>Overview</h1>
      <table>
        <thead>
          <tr>
            <th>Layer</th>
            <th>割り当て</th>
          </tr>
        </thead>
        <tbody>
          {document.layout.map((rows, index) => (
            <tr key={index}>
              <td>{layerLabel(labels, index)}</td>
              <td>
                {
                  rows
                    .flat()
                    .filter(
                      (entry) =>
                        typeof entry === "string" && entry !== "KC_NO" && entry !== "KC_TRNS",
                    ).length
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function Behaviors({
  document,
  onTapDance,
  onCombo,
  onSetting,
}: {
  document: ReturnType<typeof parseKeymapYaml>["document"];
  onTapDance: (index: number, field: number, value: string) => void;
  onCombo: (index: number, field: number, value: string) => void;
  onSetting: (qsid: number, value: string) => void;
}): React.JSX.Element {
  return (
    <section className="panel">
      <h1>Behaviors</h1>
      <h2>Tap Dance</h2>
      {document.tapDance.map((entry, index) => (
        <fieldset key={index}>
          <legend>#{index}</legend>
          {entry.map((value, field) => (
            <label key={field}>
              {field === 0
                ? "tap"
                : field === 1
                  ? "hold"
                  : field === 2
                    ? "double tap"
                    : field === 3
                      ? "hold after tap"
                      : "timeout"}
              <input
                value={String(value)}
                onChange={(event) => onTapDance(index, field, event.target.value)}
              />
            </label>
          ))}
        </fieldset>
      ))}
      <h2>Combo</h2>
      {document.combo.map((entry, index) => (
        <fieldset key={index}>
          <legend>#{index}</legend>
          {entry.map((value, field) => (
            <label key={field}>
              key {field + 1}
              <input
                value={value}
                onChange={(event) => onCombo(index, field, event.target.value)}
              />
            </label>
          ))}
        </fieldset>
      ))}
      <h2>Settings</h2>
      {Object.entries(document.settings).map(([qsid, value]) => (
        <label key={qsid}>
          {settingLabel(Number(qsid))} <span className="muted">(qsid {qsid})</span>
          <input
            type="number"
            value={value}
            onChange={(event) => onSetting(Number(qsid), event.target.value)}
          />
        </label>
      ))}
    </section>
  );
}
function Diagnostics({
  diagnostics,
  document,
}: {
  diagnostics: readonly ReturnType<typeof validateKeymap>["diagnostics"][number][];
  document: ReturnType<typeof parseKeymapYaml>["document"];
}): React.JSX.Element {
  const usage = collectReferenceUsage(document);
  const reachability = analyzeReachability(document);
  const unusedTapDance = document.tapDance
    .map((_, index) => index)
    .filter((index) => !usage.tapDance.has(index));
  const unusedMacro = document.macro
    .map((_, index) => index)
    .filter((index) => !usage.macro.has(index));

  return (
    <section className="panel">
      <h1>References / Diagnostics</h1>
      <h2>Usages</h2>
      <ul>
        {[...usage.tapDance.entries()].map(([index, count]) => (
          <li key={"tapDance-" + index}>
            TD({index}) — {count} usages
          </li>
        ))}
        {[...usage.macro.entries()].map(([index, count]) => (
          <li key={"macro-" + index}>
            M({index}) — {count} usages
          </li>
        ))}
        {usage.tapDance.size === 0 && usage.macro.size === 0 && (
          <li>参照されているdynamic entryはありません。</li>
        )}
      </ul>
      <h2>Unused</h2>
      <p>
        Tap Dance:{" "}
        {unusedTapDance.length === 0
          ? "なし"
          : unusedTapDance.map((index) => "TD(" + index + ")").join(", ")}
        <br />
        Macro:{" "}
        {unusedMacro.length === 0
          ? "なし"
          : unusedMacro.map((index) => "M(" + index + ")").join(", ")}
      </p>
      <h2>Unreachable layers</h2>
      <p>
        {reachability.reachable.size === document.layout.length
          ? "なし"
          : document.layout
              .map((_, index) => index)
              .filter((index) => !reachability.reachable.has(index))
              .join(", ")}
      </p>
      <h2>Diagnostics</h2>
      {diagnostics.length === 0 ? (
        <p>診断はありません。</p>
      ) : (
        <ul className="diagnostics">
          {diagnostics.map((diagnostic) => (
            <li key={diagnostic.id}>
              <span className={`severity ${diagnostic.severity}`}>{diagnostic.severity}</span>
              <code>{diagnostic.code}</code>
              <span>{diagnostic.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function ApplyDialog({
  state,
  changed,
  gate,
  acknowledged,
  onAcknowledge,
  onCancel,
  onApply,
}: {
  state: ApplyState | undefined;
  changed: readonly DiffEntry[];
  gate: ReturnType<typeof evaluateApplyGate> | undefined;
  acknowledged: readonly string[];
  onAcknowledge: (ids: readonly string[]) => void;
  onCancel: () => void;
  onApply: () => void;
}): React.JSX.Element {
  const semanticChanges = changed.filter((entry) => entry.change !== "notationOnly");
  const notationOnlyChanges = changed.filter((entry) => entry.change === "notationOnly");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  function renderDiff(entry: DiffEntry, index: number): React.JSX.Element {
    return (
      <li key={`${entry.subject.kind}-${index}`}>
        <code>
          {entry.before} → {entry.after}
        </code>
        <span>{entry.afterBehavior}</span>
      </li>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal-backdrop"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <section className="modal" aria-labelledby="apply-title">
        <h2 id="apply-title">Apply</h2>
        <p>backup → 差分確認 → 人間確認 → write + reread verify → 結果</p>
        <p>{changed.length} 件の差分を1件ずつ反映します。</p>
        {semanticChanges.length > 0 && (
          <>
            <h3>挙動が変わる差分</h3>
            <ul>{semanticChanges.slice(0, 12).map(renderDiff)}</ul>
          </>
        )}
        {notationOnlyChanges.length > 0 && (
          <details>
            <summary>表記だけの差分 {notationOnlyChanges.length} 件</summary>
            <ul>{notationOnlyChanges.map(renderDiff)}</ul>
          </details>
        )}
        {gate !== undefined && gate.acknowledgeable.length > 0 && (
          <section className="warning-box">
            <strong>warning {gate.acknowledgeable.length}件</strong>
            <ul>
              {gate.acknowledgeable.slice(0, 8).map((diagnostic) => (
                <li key={diagnostic.id}>{diagnostic.message}</li>
              ))}
            </ul>
            <button
              disabled={state?.phase === "writing"}
              onClick={() =>
                onAcknowledge([
                  ...new Set([
                    ...acknowledged,
                    ...gate.acknowledgeable.map((diagnostic) => diagnostic.id),
                  ]),
                ])
              }
            >
              このwarningを確認
            </button>
          </section>
        )}
        {gate !== undefined && gate.fatal.length > 0 && (
          <section className="error">
            <p>errorがあるためApplyできません。</p>
            <ul>
              {gate.fatal.slice(0, 8).map((diagnostic) => (
                <li key={diagnostic.id}>{diagnostic.message}</li>
              ))}
            </ul>
          </section>
        )}
        {state?.phase === "aborted" && (
          <p className="error">{state.reason}。再接続後にfull readからやり直してください。</p>
        )}
        <div className="modal-actions">
          <button onClick={onCancel}>{state?.phase === "writing" ? "中断" : "閉じる"}</button>
          <button disabled={state?.phase === "writing"} onClick={() => onAcknowledge([])}>
            warning確認を解除
          </button>
          <button
            className="primary"
            disabled={gate?.allowed !== true || state?.phase !== "awaitingConfirmation"}
            onClick={onApply}
          >
            確認してApply
          </button>
        </div>
        <small>acknowledged: {acknowledged.length}</small>
      </section>
    </dialog>
  );
}

async function loadStore(store: BrowserWorkspaceStore): Promise<WorkspaceModel> {
  const keymapText = required(
    await store.readText(WORKSPACE_LAYOUT.keymap),
    WORKSPACE_LAYOUT.keymap,
  );
  const parsed = parseKeymapYaml(keymapText);
  const definitionText = await readDefinitionBinding(
    store,
    parsed.binding.definitionPath,
    parsed.binding.definitionDigest,
    globalThis.crypto,
  );
  const labelsText = await store.readText(WORKSPACE_LAYOUT.labels);
  return {
    store,
    document: parsed.document,
    binding: parsed.binding,
    definition: parseDefinition(definitionText),
    labels: labelsText === undefined ? EMPTY_LABELS : parseLabelsYaml(labelsText),
    acknowledged: parseAcknowledgements(await store.readText(WORKSPACE_LAYOUT.acknowledgements)),
    token: (await store.stat(WORKSPACE_LAYOUT.keymap)) ?? undefined,
  };
}
function toWriteTarget(entry: DiffEntry): WriteTarget | undefined {
  const subject = entry.subject;
  switch (subject.kind) {
    case "key":
      return subject.layer < 0
        ? undefined
        : { kind: "key", layer: subject.layer, row: subject.row, col: subject.col };
    case "encoder":
      return {
        kind: "encoder",
        layer: subject.layer,
        index: subject.index,
        direction: subject.direction === "ccw" ? 0 : 1,
      };
    case "tapDance":
      return { kind: "tapDance", index: subject.index };
    case "combo":
      return { kind: "combo", index: subject.index };
    case "setting":
      return { kind: "setting", qsid: subject.qsid };
    default:
      return undefined;
  }
}
function required(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`${name} が見つからない`);
  return value;
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
