import type { ActionPanelAction } from "./types";

export type ActionPanelTemplate = {
    id: string;
    label: string;
    description?: string;
    draft: Partial<ActionPanelAction>;
};

export const actionPanelTemplates: ActionPanelTemplate[] = [
    {
        id: "createPR",
        label: "Create PR",
        description: "Agent prompt to create a pull request",
        draft: {
            label: "Create PR",
            icon: "git-pull-request-create",
            type: "agent",
            prompt: "/pr create",
        },
    },
    {
        id: "updatePR",
        label: "Update PR",
        description: "Agent prompt to update a pull request",
        draft: {
            label: "Update PR",
            icon: "git-pull-request",
            type: "agent",
            prompt: "/pr update",
        },
    },
    {
        id: "custom",
        label: "Custom action",
        description: "Start from a blank action",
        draft: {},
    },
];
