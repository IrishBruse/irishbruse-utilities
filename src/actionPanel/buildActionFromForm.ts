import { uniqueActionId } from "./actionPanelIds";
import type { ActionPanelAction, ActionPanelActionType, ActionPanelTerminalMode } from "./types";

const TERMINAL_MODES = new Set<ActionPanelTerminalMode>(["panel", "editor", "background"]);

export type ActionPanelFormValues = {
    label: string;
    type: ActionPanelActionType;
    icon?: string;
    prompt?: string;
    command?: string;
    terminalMode?: ActionPanelTerminalMode;
};

export type BuildActionFromFormResult =
    | { ok: true; action: ActionPanelAction }
    | { ok: false; error: string; field?: keyof ActionPanelFormValues };

export function buildActionFromForm(
    values: ActionPanelFormValues,
    existingIds: Set<string>,
    preferredId?: string
): BuildActionFromFormResult {
    const label = values.label.trim();
    if (!label) {
        return { ok: false, error: "Label is required.", field: "label" };
    }

    const icon = values.icon?.trim() || undefined;
    const id = uniqueActionId(label, existingIds, preferredId);

    if (values.type === "agent") {
        const prompt = values.prompt?.trim();
        if (!prompt) {
            return { ok: false, error: "Prompt is required for agent actions.", field: "prompt" };
        }

        return {
            ok: true,
            action: {
                id,
                label,
                type: "agent",
                icon,
                prompt,
            },
        };
    }

    if (values.type === "terminal") {
        const command = values.command?.trim();
        if (!command) {
            return { ok: false, error: "Command is required for terminal actions.", field: "command" };
        }

        const action: ActionPanelAction = {
            id,
            label,
            type: "terminal",
            icon,
            command,
        };
        const terminalMode = values.terminalMode ?? "panel";
        if (TERMINAL_MODES.has(terminalMode) && terminalMode !== "panel") {
            action.terminalMode = terminalMode;
        }
        return { ok: true, action };
    }

    const command = values.command?.trim();
    if (!command) {
        return { ok: false, error: "Command is required for VS Code command actions.", field: "command" };
    }

    return {
        ok: true,
        action: {
            id,
            label,
            type: "command",
            icon,
            command,
        },
    };
}
