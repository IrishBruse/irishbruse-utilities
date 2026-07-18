import type { ActionPanelAction } from "./types";

export const defaultActionPanelActions: ActionPanelAction[] = [
    {
        id: "createPR",
        label: "Create PR",
        icon: "git-pull-request-create",
        type: "agent",
        prompt: "/pr create",
        terminalName: "Create PR",
    },
    {
        id: "updatePR",
        label: "Update PR",
        icon: "git-pull-request",
        type: "agent",
        prompt: "/pr update",
        terminalName: "Update PR",
    },
];
