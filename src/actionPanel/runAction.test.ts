import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    executeCommand: vi.fn(),
    openAgentInEditorTerminal: vi.fn(),
}));

vi.mock("vscode", () => ({
    commands: { executeCommand: mocks.executeCommand },
}));

vi.mock("../utils/openAgentTerminal", () => ({
    openAgentInEditorTerminal: mocks.openAgentInEditorTerminal,
}));

vi.mock("./getActionPanelActions", () => ({
    getActionPanelAction: vi.fn(),
}));

import { getActionPanelAction } from "./getActionPanelActions";
import { runActionPanelItem } from "./runAction";

const mockGetActionPanelAction = vi.mocked(getActionPanelAction);

const context = {
    repoRoot: "/repo",
    branch: "feature/x",
    baseBranch: "main",
};

describe("runActionPanelItem", () => {
    beforeEach(() => {
        mockGetActionPanelAction.mockReset();
        mocks.openAgentInEditorTerminal.mockReset();
        mocks.executeCommand.mockReset();
    });

    it("runs agent actions with substituted prompts", async () => {
        mockGetActionPanelAction.mockReturnValue({
            id: "createPR",
            label: "Create PR",
            type: "agent",
            prompt: "/pr create ${branch}",
        });

        await runActionPanelItem("createPR", context);

        expect(mocks.openAgentInEditorTerminal).toHaveBeenCalledWith("/pr create feature/x", "/repo", "Create PR");
    });

    it("runs configured VS Code commands", async () => {
        mockGetActionPanelAction.mockReturnValue({
            id: "customCommand",
            label: "Custom",
            type: "command",
            command: "workbench.action.terminal.new",
            args: ["editor"],
        });

        await runActionPanelItem("customCommand", context);

        expect(mocks.executeCommand).toHaveBeenCalledWith("workbench.action.terminal.new", "editor");
    });
});
