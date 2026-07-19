import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn().mockReturnValue(undefined);
const mockOpen = vi.fn();

vi.mock("vscode", () => ({
    ConfigurationTarget: { Workspace: 1 },
    window: {
        showInformationMessage: vi.fn(),
        showWarningMessage: vi.fn(),
    },
    workspace: {
        getConfiguration: vi.fn(),
    },
}));

vi.mock("./getActionPanelActions", () => ({
    getConfiguredActionPanelActions: vi.fn(),
    getActionPanelAction: vi.fn(),
}));

vi.mock("./refresh", () => ({
    refreshActionPanel: vi.fn(),
}));

import { window, workspace } from "vscode";
import { addActionPanelAction, appendActionPanelAction, deleteActionPanelAction, updateActionPanelAction } from "./addActionPanelAction";
import { getActionPanelAction, getConfiguredActionPanelActions } from "./getActionPanelActions";
import { refreshActionPanel } from "./refresh";

const mockGetConfiguredActionPanelActions = vi.mocked(getConfiguredActionPanelActions);
const mockGetActionPanelAction = vi.mocked(getActionPanelAction);
const mockRefreshActionPanel = vi.mocked(refreshActionPanel);
const mockShowWarningMessage = vi.mocked(window.showWarningMessage);

describe("appendActionPanelAction", () => {
    beforeEach(() => {
        mockUpdate.mockClear();
        mockGet.mockReset();
        mockGetConfiguredActionPanelActions.mockReset();
        mockRefreshActionPanel.mockReset();
        vi.mocked(workspace.getConfiguration).mockReturnValue({
            get: mockGet,
            update: mockUpdate,
        } as never);
    });

    it("appends to configured actions and refreshes the panel", async () => {
        mockGetConfiguredActionPanelActions.mockReturnValue([
            {
                id: "existing",
                label: "Existing",
                type: "agent",
                prompt: "/existing",
            },
        ]);

        await appendActionPanelAction({
            id: "deploy",
            label: "Deploy",
            type: "agent",
            prompt: "/deploy",
        });

        expect(mockUpdate).toHaveBeenCalledWith(
            "actionPanel.actions",
            [
                {
                    id: "existing",
                    label: "Existing",
                    type: "agent",
                    prompt: "/existing",
                },
                {
                    id: "deploy",
                    label: "Deploy",
                    type: "agent",
                    prompt: "/deploy",
                },
            ],
            1
        );
        expect(mockRefreshActionPanel).toHaveBeenCalled();
    });
});

describe("addActionPanelAction", () => {
    beforeEach(() => {
        mockOpen.mockReset();
        mockGetConfiguredActionPanelActions.mockReset();
        mockUpdate.mockClear();
        mockRefreshActionPanel.mockReset();
        vi.mocked(workspace.getConfiguration).mockReturnValue({
            get: mockGet,
            update: mockUpdate,
        } as never);
        mockGetConfiguredActionPanelActions.mockReturnValue([]);
    });

    it("appends the action returned by the editor", async () => {
        mockOpen.mockResolvedValue({
            id: "createPR",
            label: "Create PR",
            type: "agent",
            prompt: "/pr create",
            icon: "git-pull-request-create",
        });

        await addActionPanelAction({ open: mockOpen } as never);

        expect(mockOpen).toHaveBeenCalled();
        expect(mockUpdate).toHaveBeenCalledWith(
            "actionPanel.actions",
            [
                expect.objectContaining({
                    id: "createPR",
                    label: "Create PR",
                    type: "agent",
                    prompt: "/pr create",
                    icon: "git-pull-request-create",
                }),
            ],
            1
        );
    });

    it("does nothing when the editor is cancelled", async () => {
        mockOpen.mockResolvedValue(undefined);

        await addActionPanelAction({ open: mockOpen } as never);

        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

describe("updateActionPanelAction", () => {
    beforeEach(() => {
        mockUpdate.mockClear();
        vi.mocked(workspace.getConfiguration).mockReturnValue({
            get: mockGet,
            update: mockUpdate,
        } as never);
        mockGetConfiguredActionPanelActions.mockReturnValue([
            {
                id: "createPR",
                label: "Create PR",
                type: "agent",
                prompt: "/pr create",
            },
        ]);
    });

    it("replaces the matching action in settings", async () => {
        await updateActionPanelAction(
            {
                id: "createPR",
                label: "Create Pull Request",
                type: "agent",
                prompt: "/pr create",
            },
            "createPR"
        );

        expect(mockUpdate).toHaveBeenCalledWith(
            "actionPanel.actions",
            [
                {
                    id: "createPR",
                    label: "Create Pull Request",
                    type: "agent",
                    prompt: "/pr create",
                },
            ],
            1
        );
    });
});

describe("deleteActionPanelAction", () => {
    beforeEach(() => {
        mockUpdate.mockClear();
        mockShowWarningMessage.mockReset();
        vi.mocked(workspace.getConfiguration).mockReturnValue({
            get: mockGet,
            update: mockUpdate,
        } as never);
        mockGetConfiguredActionPanelActions.mockReturnValue([
            {
                id: "createPR",
                label: "Create PR",
                type: "agent",
                prompt: "/pr create",
            },
        ]);
        mockGetActionPanelAction.mockReturnValue({
            id: "createPR",
            label: "Create PR",
            type: "agent",
            prompt: "/pr create",
        });
    });

    it("removes the action after confirmation", async () => {
        mockShowWarningMessage.mockResolvedValue("Delete");

        await deleteActionPanelAction("createPR");

        expect(mockUpdate).toHaveBeenCalledWith("actionPanel.actions", [], 1);
    });

    it("does nothing when delete is cancelled", async () => {
        mockShowWarningMessage.mockResolvedValue(undefined);

        await deleteActionPanelAction("createPR");

        expect(mockUpdate).not.toHaveBeenCalled();
    });
});
