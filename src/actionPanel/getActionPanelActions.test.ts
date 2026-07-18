import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultActionPanelActions } from "./defaultActions";

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

    it("returns defaults when setting is missing", () => {
        mockGetConfiguration.mockReturnValue({
            get: vi.fn().mockReturnValue(undefined),
        } as never);

        expect(getConfiguredActionPanelActions()).toEqual(defaultActionPanelActions);
    });

    it("returns valid custom actions from settings", () => {
        mockGetConfiguration.mockReturnValue({
            get: vi.fn().mockReturnValue([
                {
                    id: "custom",
                    label: "Custom Agent",
                    type: "agent",
                    prompt: "/do ${branch}",
                    terminalName: "Custom",
                },
            ]),
        } as never);

        expect(getConfiguredActionPanelActions()).toEqual([
            {
                id: "custom",
                label: "Custom Agent",
                type: "agent",
                prompt: "/do ${branch}",
                terminalName: "Custom",
                when: "always",
            },
        ]);
    });

    it("filters invalid entries and falls back to defaults when none remain", () => {
        mockGetConfiguration.mockReturnValue({
            get: vi.fn().mockReturnValue([{ id: "broken", label: "Broken", type: "agent" }]),
        } as never);

        expect(getConfiguredActionPanelActions()).toEqual(defaultActionPanelActions);
    });
});
