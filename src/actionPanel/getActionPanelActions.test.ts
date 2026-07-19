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
            get: vi.fn().mockReturnValue(undefined),
        } as never);

        expect(getConfiguredActionPanelActions()).toEqual([]);
    });

    it("returns valid custom actions from settings", () => {
        mockGetConfiguration.mockReturnValue({
            get: vi.fn().mockReturnValue([
                {
                    id: "custom",
                    label: "Custom Agent",
                    type: "agent",
                    prompt: "/do ${branch}",
                },
            ]),
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

    it("filters invalid and legacy built-in entries", () => {
        mockGetConfiguration.mockReturnValue({
            get: vi.fn().mockReturnValue([
                { id: "broken", label: "Broken", type: "agent" },
                { id: "legacy", label: "Open PR", type: "builtin", builtin: "openPR" },
            ]),
        } as never);

        expect(getConfiguredActionPanelActions()).toEqual([]);
    });
});
