import { ConfigurationTarget, window, workspace } from "vscode";
import type { ActionPanelActionEditor } from "./ActionPanelActionEditor";
import { getActionPanelAction, getConfiguredActionPanelActions } from "./getActionPanelActions";
import { refreshActionPanel } from "./refresh";
import type { ActionPanelAction } from "./types";

async function saveActionPanelActions(actions: ActionPanelAction[]): Promise<void> {
    const config = workspace.getConfiguration("ib-utilities");
    await config.update("actionPanel.actions", actions, ConfigurationTarget.Workspace);
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
