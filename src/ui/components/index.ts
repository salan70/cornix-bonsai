import { AppHeader as AppHeaderComponent } from "./AppHeader.js";
import { ApplyDialog as ApplyDialogComponent } from "./ApplyDialog.js";
import { Behaviors as BehaviorsComponent } from "./Behaviors.js";
import { DiagnosticsPanel as DiagnosticsPanelComponent } from "./DiagnosticsPanel.js";
import { KeyPanel as KeyPanelComponent } from "./KeyPanel.js";
import { KeymapTab as KeymapTabComponent } from "./KeymapTab.js";
import { KeycodePicker as KeycodePickerComponent } from "./KeycodePicker.js";
import { Overview as OverviewComponent } from "./Overview.js";
import { References as ReferencesComponent } from "./References.js";
import { StatusBar as StatusBarComponent } from "./StatusBar.js";
import { WorkspaceRecovery as WorkspaceRecoveryComponent } from "./WorkspaceRecovery.js";

/** @doc docs/specs/ui.md#header-and-status */
export const AppHeader = AppHeaderComponent;

/** @doc docs/specs/ui.md#header-and-status */
export const StatusBar = StatusBarComponent;

/** @doc docs/specs/ui.md#keymap-editor */
export const KeymapTab = KeymapTabComponent;

/** @doc docs/specs/ui.md#side-panel-editing-controls */
export const KeyPanel = KeyPanelComponent;

/** @doc docs/specs/ui.md#keycode-picker */
export const KeycodePicker = KeycodePickerComponent;

/** @doc docs/specs/ui.md#diagnostic-panel */
export const DiagnosticsPanel = DiagnosticsPanelComponent;

/** @doc docs/specs/ui.md#apply-modal-steps */
export const ApplyDialog = ApplyDialogComponent;

/** @doc docs/specs/ui.md#overview-layer-grid */
export const Overview = OverviewComponent;

/** @doc docs/specs/ui.md#behaviors-and-references */
export const Behaviors = BehaviorsComponent;

/** @doc docs/specs/ui.md#behaviors-and-references */
export const References = ReferencesComponent;

/** @doc docs/specs/ui.md#workspace-recovery */
export const WorkspaceRecovery = WorkspaceRecoveryComponent;
