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

    it("returns valid terminal actions from user settings", () => {
        mockGetConfiguration.mockReturnValue({
            inspect: vi.fn().mockReturnValue({
                globalValue: [
                    {
                        id: "runTests",
                        label: "Run tests",
                        type: "terminal",
                        command: "npm test",
                        terminalMode: "background",
                    },
                ],
            }),
        } as never);

        expect(getConfiguredActionPanelActions()).toEqual([
            {
                id: "runTests",
                label: "Run tests",
                type: "terminal",
                command: "npm test",
                terminalMode: "background",
            },
        ]);
    });

    it("migrates legacy terminal run flags to terminalMode", () => {
        mockGetConfiguration.mockReturnValue({
            inspect: vi.fn().mockReturnValue({
                globalValue: [
                    {
                        id: "runTests",
                        label: "Run tests",
                        type: "terminal",
                        command: "npm test",
                        runInEditor: true,
                    },
                ],
            }),
        } as never);

        expect(getConfiguredActionPanelActions()).toEqual([
            {
                id: "runTests",
                label: "Run tests",
                type: "terminal",
                command: "npm test",
                terminalMode: "editor",
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
