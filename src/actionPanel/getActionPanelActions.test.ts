import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    workspace: {
        getConfiguration: vi.fn(),
    },
}));

import { workspace } from "vscode";
import { getConfiguredActionPanelActions } from "./getActionPanelActions";

const mockGetConfiguration = vi.mocked(workspace.getConfiguration);

describe("getConfiguredActionPanelActions", () => {
    beforeEach(() => {
        mockGetConfiguration.mockReset();
    });

    it("returns an empty list when setting is missing", () => {
        mockGetConfiguration.mockReturnValue({
            inspect: vi.fn().mockReturnValue(undefined),
        } as never);

        expect(getConfiguredActionPanelActions()).toEqual([]);
    });

    it("returns valid custom actions from user settings", () => {
        mockGetConfiguration.mockReturnValue({
            inspect: vi.fn().mockReturnValue({
                globalValue: [
                    {
                        id: "custom",
                        label: "Custom Agent",
                        type: "agent",
                        prompt: "/do ${branch}",
                    },
                ],
            }),
        } as never);

        expect(getConfiguredActionPanelActions()).toEqual([
            {
                id: "custom",
                label: "Custom Agent",
                type: "agent",
                prompt: "/do ${branch}",
            },
        ]);
    });

    it("prefers user settings over workspace overrides", () => {
        mockGetConfiguration.mockReturnValue({
            inspect: vi.fn().mockReturnValue({
                globalValue: [
                    {
                        id: "createPR",
                        label: "Create PR",
                        type: "agent",
                        prompt: "/pr create",
                    },
                    {
                        id: "updatePR",
                        label: "Update PR",
                        type: "agent",
                        prompt: "/pr update",
                    },
                ],
                workspaceValue: [
                    {
                        id: "updatePR",
                        label: "Update PR",
                        type: "agent",
                        prompt: "/pr update",
                    },
                    {
                        id: "createPR",
                        label: "Create PR",
                        type: "agent",
                        prompt: "/pr create",
                    },
                ],
            }),
        } as never);

        expect(getConfiguredActionPanelActions().map((action) => action.id)).toEqual(["createPR", "updatePR"]);
    });

    it("filters invalid and legacy built-in entries", () => {
        mockGetConfiguration.mockReturnValue({
            inspect: vi.fn().mockReturnValue({
                globalValue: [
                    { id: "broken", label: "Broken", type: "agent" },
                    { id: "legacy", label: "Open PR", type: "builtin", builtin: "openPR" },
                ],
            }),
        } as never);

        expect(getConfiguredActionPanelActions()).toEqual([]);
    });
});
