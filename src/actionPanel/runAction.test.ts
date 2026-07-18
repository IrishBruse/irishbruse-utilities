import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    executeCommand: vi.fn(),
    openAgentInEditorTerminal: vi.fn(),
}));

vi.mock("vscode", () => ({
    commands: { executeCommand: mocks.executeCommand },
    window: {
        showWarningMessage: vi.fn(),
    },
}));

vi.mock("../commands/openPR", () => ({
    openPR: vi.fn(),
}));

vi.mock("../git/openBranchDiff", () => ({
    openBranchDiff: vi.fn(),
}));

vi.mock("../git/publishReview", () => ({
    publishReviewToPR: vi.fn(),
}));

vi.mock("../utils/openAgentTerminal", () => ({
    openAgentInEditorTerminal: mocks.openAgentInEditorTerminal,
}));

vi.mock("./getActionPanelActions", () => ({
    getActionPanelAction: vi.fn(),
}));

vi.mock("./refresh", () => ({
    refreshActionPanel: vi.fn(),
}));

import { openPR } from "../commands/openPR";
import { openBranchDiff } from "../git/openBranchDiff";
import { publishReviewToPR } from "../git/publishReview";
import { getActionPanelAction } from "./getActionPanelActions";
import { runActionPanelItem } from "./runAction";

const mockGetActionPanelAction = vi.mocked(getActionPanelAction);
const mockOpenPR = vi.mocked(openPR);
const mockOpenBranchDiff = vi.mocked(openBranchDiff);
const mockPublishReviewToPR = vi.mocked(publishReviewToPR);

const context = {
    repoRoot: "/repo",
    branch: "feature/x",
    baseBranch: "main",
};

describe("runActionPanelItem", () => {
    beforeEach(() => {
        mockGetActionPanelAction.mockReset();
        mockOpenPR.mockReset();
        mockOpenBranchDiff.mockReset();
        mockPublishReviewToPR.mockReset();
        mocks.openAgentInEditorTerminal.mockReset();
        mocks.executeCommand.mockReset();
    });

    it("runs built-in openPR", async () => {
        mockGetActionPanelAction.mockReturnValue({
            id: "openPR",
            label: "Open PR",
            type: "builtin",
            builtin: "openPR",
        });

        await runActionPanelItem("openPR", context);

        expect(mockOpenPR).toHaveBeenCalledWith(undefined, "/repo");
    });

    it("runs agent actions with substituted prompts", async () => {
        mockGetActionPanelAction.mockReturnValue({
            id: "createPR",
            label: "Create PR",
            type: "agent",
            prompt: "/pr create ${branch}",
            terminalName: "Create PR",
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
