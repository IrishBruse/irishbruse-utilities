import type { ActionPanelAction } from "./types";

export type ActionPanelTemplate = {
    id: string;
    label: string;
    description?: string;
    draft: Partial<ActionPanelAction>;
};

export const actionPanelTemplates: ActionPanelTemplate[] = [
    {
        id: "custom",
        label: "Custom action",
        description: "Start from a blank action",
        draft: {},
    },
];
