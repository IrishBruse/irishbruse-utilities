import { workspace } from "vscode";
import type { ActionPanelAction, ActionPanelActionType } from "./types";

const ACTION_TYPES = new Set<ActionPanelActionType>(["agent", "command"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeAction(raw: unknown): ActionPanelAction | undefined {
    if (!isRecord(raw)) {
        return undefined;
    }

    const id = asString(raw.id);
    const label = asString(raw.label);
    const type = asString(raw.type) as ActionPanelActionType | undefined;
    if (!id || !label || !type || !ACTION_TYPES.has(type)) {
        return undefined;
    }

    const action: ActionPanelAction = {
        id,
        label,
        type,
        icon: asString(raw.icon),
        prompt: asString(raw.prompt),
        command: asString(raw.command),
    };

    if (Array.isArray(raw.args)) {
        action.args = raw.args;
    }

    if (type === "agent" && !action.prompt) {
        return undefined;
    }
    if (type === "command" && !action.command) {
        return undefined;
    }

    return action;
}

function getConfiguredActionPanelActionEntries(): unknown[] {
    const inspect = workspace.getConfiguration("ib-utilities").inspect<unknown[]>("actionPanel.actions");
    if (inspect?.globalValue !== undefined) {
        return inspect.globalValue;
    }
    if (inspect?.workspaceValue !== undefined) {
        return inspect.workspaceValue;
    }
    if (inspect?.workspaceFolderValue !== undefined) {
        return inspect.workspaceFolderValue;
    }

    return inspect?.defaultValue ?? [];
}

export function getConfiguredActionPanelActions(): ActionPanelAction[] {
    const configured = getConfiguredActionPanelActionEntries();
    if (!configured.length) {
        return [];
    }

    const actions: ActionPanelAction[] = [];
    const seen = new Set<string>();
    for (const entry of configured) {
        const action = normalizeAction(entry);
        if (!action || seen.has(action.id)) {
            continue;
        }
        seen.add(action.id);
        actions.push(action);
    }

    return actions;
}

export function getActionPanelAction(id: string): ActionPanelAction | undefined {
    return getConfiguredActionPanelActions().find((action) => action.id === id);
}
