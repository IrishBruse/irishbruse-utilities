export type ActionPanelActionType = "agent" | "command";

export type ActionPanelAction = {
    id: string;
    label: string;
    icon?: string;
    type: ActionPanelActionType;
    prompt?: string;
    command?: string;
    args?: unknown[];
};

export type ActionPanelContext = {
    repoRoot: string;
    branch?: string;
    baseBranch?: string;
};
