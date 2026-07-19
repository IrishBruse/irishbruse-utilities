import { ConfigurationTarget, window, workspace, type ConfigurationChangeEvent } from "vscode";
import type { ActionPanelActionEditor } from "./ActionPanelActionEditor";
import { getActionPanelAction, getConfiguredActionPanelActions } from "./getActionPanelActions";
import { refreshActionPanel } from "./refresh";
import type { ActionPanelAction } from "./types";

export function affectsActionPanelActions(event: ConfigurationChangeEvent): boolean {
    return (
        event.affectsConfiguration("ib-utilities.actionPanel.actions") ||
        event.affectsConfiguration("ib-utilities")
    );
}

export async function migrateActionPanelSettingsFromWorkspace(): Promise<void> {
    const config = workspace.getConfiguration("ib-utilities");
    const inspect = config.inspect<ActionPanelAction[]>("actionPanel.actions");
    const workspaceActions = inspect?.workspaceValue;
    if (workspaceActions === undefined) {
        return;
    }

    const globalActions = inspect?.globalValue;
    if (!globalActions?.length && workspaceActions.length) {
        await config.update("actionPanel.actions", workspaceActions, ConfigurationTarget.Global);
    }

    await clearActionPanelWorkspaceOverrides(config);
    refreshActionPanel();
}

async function clearActionPanelWorkspaceOverrides(
    config: ReturnType<typeof workspace.getConfiguration>
): Promise<void> {
    await config.update("actionPanel.actions", undefined, ConfigurationTarget.Workspace);
    for (const folder of workspace.workspaceFolders ?? []) {
        const folderConfig = workspace.getConfiguration("ib-utilities", folder.uri);
        await folderConfig.update("actionPanel.actions", undefined, ConfigurationTarget.WorkspaceFolder);
    }
}

async function saveActionPanelActions(actions: ActionPanelAction[]): Promise<void> {
    const config = workspace.getConfiguration("ib-utilities");
    await config.update("actionPanel.actions", actions, ConfigurationTarget.Global);
    await clearActionPanelWorkspaceOverrides(config);
    refreshActionPanel();
}

export async function appendActionPanelAction(action: ActionPanelAction): Promise<void> {
    await saveActionPanelActions([...getConfiguredActionPanelActions(), action]);
}

export async function updateActionPanelAction(action: ActionPanelAction, originalId: string): Promise<void> {
    const actions = getConfiguredActionPanelActions().map((entry) => (entry.id === originalId ? action : entry));
    await saveActionPanelActions(actions);
}

export async function deleteActionPanelAction(actionId: string): Promise<void> {
    const action = getActionPanelAction(actionId);
    if (!action) {
        return;
    }

    const confirmed = await window.showWarningMessage(
        `Delete action "${action.label}"?`,
        { modal: true },
        "Delete"
    );
    if (confirmed !== "Delete") {
        return;
    }

    await saveActionPanelActions(getConfiguredActionPanelActions().filter((entry) => entry.id !== actionId));
    window.showInformationMessage(`Deleted action "${action.label}"`);
}

export async function addActionPanelAction(editor: ActionPanelActionEditor): Promise<void> {
    const action = await editor.open();
    if (!action) {
        return;
    }

    await appendActionPanelAction(action);
    window.showInformationMessage(`Added action "${action.label}"`);
}

export async function editActionPanelAction(editor: ActionPanelActionEditor, actionId: string): Promise<void> {
    const existing = getActionPanelAction(actionId);
    if (!existing) {
        window.showWarningMessage(`Unknown action: ${actionId}`);
        return;
    }

    const action = await editor.open({ action: existing });
    if (!action) {
        return;
    }

    await updateActionPanelAction(action, existing.id);
    window.showInformationMessage(`Updated action "${action.label}"`);
}
