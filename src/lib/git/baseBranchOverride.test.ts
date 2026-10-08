import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn().mockReturnValue(undefined);

vi.mock("vscode", () => ({
    ExtensionContext: class {},
}));

import {
    getBaseBranchOverride,
    registerBaseBranchOverrideStorage,
    setBaseBranchOverride,
} from "./baseBranchOverride";

describe("baseBranchOverride", () => {
    beforeEach(() => {
        mockUpdate.mockClear();
        mockGet.mockReset();
        registerBaseBranchOverrideStorage({
            workspaceState: {
                get: mockGet,
                update: mockUpdate,
            },
        } as never);
    });

    it("returns undefined when no override is stored", () => {
        mockGet.mockReturnValue(undefined);
        expect(getBaseBranchOverride("/repo")).toBeUndefined();
    });

    it("stores and reads overrides per repo", async () => {
        mockGet.mockReturnValue({ "/repo": "develop" });
        expect(getBaseBranchOverride("/repo")).toBe("develop");

        await setBaseBranchOverride("/repo", "release/1.2");
        expect(mockUpdate).toHaveBeenCalledWith("gitHelpers.baseBranchOverrides", { "/repo": "release/1.2" });
    });

    it("clears an override when set to undefined", async () => {
        mockGet.mockReturnValue({ "/repo": "develop", "/other": "main" });
        await setBaseBranchOverride("/repo", undefined);
        expect(mockUpdate).toHaveBeenCalledWith("gitHelpers.baseBranchOverrides", { "/other": "main" });
    });
});
