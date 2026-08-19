import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { diffDocuments, type DiffEntry } from "../core/diff/diff.ts";
import { setKeyAssignment } from "../core/model/edit.ts";
import { buildKeymapView } from "../core/model/keymap-view.ts";
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
import { parseDefinition } from "../core/definition/parse.ts";
import { parseKeymapYaml } from "../core/keymap-yaml/parse.ts";
import { serializeKeymapYaml } from "../core/keymap-yaml/serialize.ts";
import { parseVil } from "../core/vil/parse.ts";
import { serializeVil } from "../core/vil/serialize.ts";
import { DeviceIoError } from "../device/protocol.ts";
import { WebHidAdapter, type ReadDeviceResult, type WebHidConnection } from "../device/webhid.ts";
import { backupPath, definitionPath, sha256Hex, WORKSPACE_LAYOUT } from "../workspace/layout.ts";
import {
  EMPTY_LABELS,
  layerLabel,
  parseLabelsYaml,
  type WorkspaceLabels,
} from "../workspace/labels.ts";
import { parseAcknowledgements, serializeAcknowledgements } from "../workspace/acknowledgements.ts";
import { settingLabel } from "../workspace/settings.ts";
import { writeTextIfUnchanged, type WorkspaceConflictToken } from "../workspace/types.ts";
import { BrowserWorkspaceStore, pickWorkspace, restoreWorkspace } from "./browser-workspace.ts";
import "./styles.css";

type Tab = "Keymap" | "Overview" | "Behaviors" | "References";
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
  const [selection, setSelection] = useState<{ row: number; col: number } | undefined>();
  const [device, setDevice] = useState<WebHidConnection | undefined>();
  const [deviceRead, setDeviceRead] = useState<ReadDeviceResult | undefined>();
  const [status, setStatus] = useState("workspaceを選択してください");
  const [progress, setProgress] = useState<string | undefined>();
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyState, setApplyState] = useState<ApplyState | undefined>();
  const applyCancellation = useRef(false);

  useEffect(() => {
    void restoreWorkspace().then((store) =>
      store === undefined
        ? undefined
        : loadStore(store)
            .then((model) => {
              setWorkspace(model);
              setAcknowledged(model.acknowledged);
            })
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
    return diffDocuments(deviceRead.document, workspace.document, workspace.definition).entries;
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
    if (targets.length === changed.length)
      return evaluateApplyGate(validationResult.evidence, acknowledged);
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
        diagnostics: Object.freeze([...validationResult.evidence.diagnostics, unsupported]),
      },
      acknowledged,
    );
  }, [acknowledged, changed, deviceRead, workspace]);

  async function openWorkspace(): Promise<void> {
    try {
      const store = await pickWorkspace();
      const model = await loadStore(store);
      setWorkspace(model);
      setAcknowledged(model.acknowledged);
      setStatus("workspaceを開いた");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function reload(): Promise<void> {
    if (workspace === undefined) return;
    try {
      const model = await loadStore(workspace.store);
      setWorkspace(model);
      setAcknowledged(model.acknowledged);
      setStatus("keymap.yamlを再読み込みした");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function save(document = workspace?.document): Promise<void> {
    if (workspace === undefined || document === undefined) return;
    try {
      const text = serializeKeymapYaml(document, workspace.binding);
      await writeTextIfUnchanged(workspace.store, WORKSPACE_LAYOUT.keymap, text, workspace.token);
      setWorkspace({
        ...workspace,
        document,
        token: (await workspace.store.stat(WORKSPACE_LAYOUT.keymap)) ?? undefined,
      });
      setStatus("keymap.yamlへ保存した");
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
      setStatus("切断した");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function readDevice(): Promise<void> {
    if (device === undefined) return;
    try {
      const result = await device.read((event) => setProgress(`${event.label} (${event.count})`));
      setDeviceRead(result);
      let mismatch = false;
      if (workspace !== undefined) {
        const definitionText = JSON.stringify(result.definition, null, 2) + "\n";
        const digest = await sha256Hex(new TextEncoder().encode(definitionText), globalThis.crypto);
        const path = definitionPath(digest);
        await workspace.store.writeText(path, definitionText);
        if (
          workspace.binding.definitionDigest !== digest ||
          workspace.document.uid !== result.keyboardUid
        ) {
          mismatch = true;
        }
      }
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

  async function apply(): Promise<void> {
    if (
      workspace === undefined ||
      device === undefined ||
      deviceRead === undefined ||
      changed.length === 0
    )
      return;
    try {
      applyCancellation.current = false;
      const gate = applyGate;
      if (gate === undefined) return;
      if (!gate.allowed) {
        setApplyOpen(true);
        setApplyState(undefined);
        return;
      }
      const input = createValidatedApplyInput(gate, deviceRead.snapshot);
      const plan = createApplyPlan(input);
      const state = confirmApply(plan, plan.fingerprint);
      setApplyOpen(true);
      setApplyState(state);
      const backupText = serializeVil(deviceRead.document);
      await workspace.store.writeText(backupPath(), backupText);
      await workspace.store.writeText(WORKSPACE_LAYOUT.latestBackup, backupText);
      if (applyCancellation.current) {
        setStatus("Applyを中断した。writeは開始していない");
        return;
      }
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

  async function acknowledge(ids: readonly string[]): Promise<void> {
    if (workspace === undefined) return;
    try {
      const next = [...new Set(ids)].sort();
      await workspace.store.writeText(
        WORKSPACE_LAYOUT.acknowledgements,
        serializeAcknowledgements(next),
      );
      setAcknowledged(next);
      setWorkspace({ ...workspace, acknowledged: next });
    } catch (error) {
      setStatus(message(error));
    }
  }

  function editKey(keycode: string): void {
    if (workspace === undefined || selection === undefined) return;
    try {
      void save(
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
    void save({
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
    void save({
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
    void save({
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
              layer={layer}
              setLayer={setLayer}
              selection={selection}
              setSelection={setSelection}
              labels={workspace.labels}
              onEdit={editKey}
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
          {tab === "References" && <Diagnostics diagnostics={validation?.diagnostics ?? []} />}
        </main>
      )}
      <footer className="status-bar">
        <span>⛔ {validation?.summary.error ?? 0}</span>
        <span>⚠ {validation?.summary.warning ?? 0}</span>
        <span>ⓘ {validation?.summary.information ?? 0}</span>
        <span className="status-message">{progress ?? status}</span>
        <button
          onClick={() => void apply()}
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
          onAcknowledge={(ids) => void acknowledge(ids)}
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
  layer,
  setLayer,
  selection,
  setSelection,
  labels,
  onEdit,
}: {
  view: ReturnType<typeof buildKeymapView>;
  layer: number;
  setLayer: (value: number) => void;
  selection: { row: number; col: number } | undefined;
  setSelection: (value: { row: number; col: number }) => void;
  labels: WorkspaceLabels;
  onEdit: (value: string) => void;
}): React.JSX.Element {
  const selected =
    selection === undefined
      ? undefined
      : view.keys.find(
          (key) =>
            key.position.layer === layer &&
            key.position.row === selection.row &&
            key.position.col === selection.col,
        );
  return (
    <section className="keymap-layout">
      <div className="editor-pane">
        <div className="layer-tabs">
          {Array.from({ length: view.capacities.layerCount }, (_, index) => (
            <button
              className={layer === index ? "active" : ""}
              onClick={() => setLayer(index)}
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
                className={`keycap ${selected?.position.row === key.position.row && selected.position.col === key.position.col ? "selected" : ""}`}
                style={{
                  left: `${key.physical.x * 56}px`,
                  top: `${key.physical.y * 56}px`,
                  width: `${key.physical.width * 54}px`,
                  height: `${key.physical.height * 54}px`,
                  transform: `rotate(${key.physical.rotationAngle}deg)`,
                }}
                onClick={() => setSelection({ row: key.position.row, col: key.position.col })}
                key={`${key.position.row}:${key.position.col}`}
              >
                <span>
                  {key.resolved.kind === "basic"
                    ? key.resolved.name.replace("KC_", "")
                    : key.keycode}
                </span>
              </button>
            ))}
        </div>
      </div>
      <aside className="side-panel">
        <h2>選択中のキー</h2>
        {selected === undefined ? (
          <p>盤面からキーを選択してください。</p>
        ) : (
          <>
            <p className="muted">
              layer {layer} / row {selected.position.row} / col {selected.position.col}
            </p>
            <label>
              raw keycode
              <input value={selected.keycode} onChange={(event) => onEdit(event.target.value)} />
            </label>
            <p className="detail">
              {selected.resolved.kind === "custom"
                ? selected.resolved.title
                : selected.resolved.kind}
            </p>
          </>
        )}
      </aside>
    </section>
  );
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
}: {
  diagnostics: readonly ReturnType<typeof validateKeymap>["diagnostics"][number][];
}): React.JSX.Element {
  return (
    <section className="panel">
      <h1>References / Diagnostics</h1>
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
  return (
    <dialog
      className="modal-backdrop"
      open
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <section className="modal" aria-labelledby="apply-title">
        <h2 id="apply-title">Apply</h2>
        <p>backup → 差分確認 → 人間確認 → write + reread verify → 結果</p>
        <p>{changed.length} 件の差分を1件ずつ反映します。</p>
        <ul>
          {changed.slice(0, 12).map((entry, index) => (
            <li key={index}>
              <code>
                {entry.before} → {entry.after}
              </code>
              <span>{entry.afterBehavior}</span>
            </li>
          ))}
        </ul>
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
  const definitionText = required(
    await store.readText(parsed.binding.definitionPath),
    parsed.binding.definitionPath,
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
