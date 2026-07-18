export type ActionPanelWhen = "always" | "hasBaseBranch" | "hasUnpublishedNotes";

export type ActionPanelBuiltin = "openPR" | "diffWithBase" | "publishReview";

export type ActionPanelActionType = "builtin" | "agent" | "command";

export type ActionPanelAction = {
    id: string;
    label: string;
    icon?: string;
    type: ActionPanelActionType;
    when?: ActionPanelWhen;
    builtin?: ActionPanelBuiltin;
    prompt?: string;
    terminalName?: string;
    command?: string;
    args?: unknown[];
};

export type ActionPanelContext = {
    repoRoot: string;
    branch?: string;
    baseBranch?: string;
};
