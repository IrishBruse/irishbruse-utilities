import { workspace } from "vscode";
import { defaultActionPanelActions } from "./defaultActions";
import type { ActionPanelAction, ActionPanelActionType, ActionPanelBuiltin, ActionPanelWhen } from "./types";

const BUILTIN_IDS = new Set<ActionPanelBuiltin>(["openPR", "diffWithBase", "publishReview"]);
const ACTION_TYPES = new Set<ActionPanelActionType>(["builtin", "agent", "command"]);
const WHEN_VALUES = new Set<ActionPanelWhen>(["always", "hasBaseBranch", "hasUnpublishedNotes"]);

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
        when: (asString(raw.when) as ActionPanelWhen | undefined) ?? "always",
        terminalName: asString(raw.terminalName),
        prompt: asString(raw.prompt),
        command: asString(raw.command),
    };

    if (action.when && !WHEN_VALUES.has(action.when)) {
        action.when = "always";
    }

    const builtin = asString(raw.builtin) as ActionPanelBuiltin | undefined;
    if (builtin && BUILTIN_IDS.has(builtin)) {
        action.builtin = builtin;
    }

    if (Array.isArray(raw.args)) {
        action.args = raw.args;
    }

    if (type === "builtin" && !action.builtin) {
        return undefined;
    }
    if (type === "agent" && !action.prompt) {
        return undefined;
    }
    if (type === "command" && !action.command) {
        return undefined;
    }

    return action;
}

export function getConfiguredActionPanelActions(): ActionPanelAction[] {
    const configured = workspace.getConfiguration("ib-utilities").get<unknown[]>("actionPanel.actions");
    if (!configured?.length) {
        return [...defaultActionPanelActions];
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

    return actions.length > 0 ? actions : [...defaultActionPanelActions];
}

export function getActionPanelAction(id: string): ActionPanelAction | undefined {
    return getConfiguredActionPanelActions().find((action) => action.id === id);
}
