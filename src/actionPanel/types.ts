export type ActionPanelActionType = "agent" | "command" | "terminal";

export type ActionPanelTerminalMode = "panel" | "editor" | "background";

export type ActionPanelAction = {
    id: string;
    label: string;
    icon?: string;
    type: ActionPanelActionType;
    prompt?: string;
    command?: string;
    args?: unknown[];
    terminalMode?: ActionPanelTerminalMode;
};

export type ActionPanelContext = {
    repoRoot: string;
    branch?: string;
    baseBranch?: string;
    file: string;
    selection: string;
};
