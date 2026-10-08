import { describe, expect, it, vi } from "vitest";
import type { Branch, Repository } from "./gitApi";
import { RefType } from "./gitApi";

vi.mock("./baseBranchOverride", () => ({
    getBaseBranchOverride: vi.fn().mockReturnValue(undefined),
}));

import { getBaseBranchOverride } from "./baseBranchOverride";
import { formatBranchName, isMainlineBranch, isSameBranch, resolveBaseBranch } from "./resolveBaseBranch";

function mockRepository(overrides: {
    head?: Branch;
    getBranchBase?: (name: string) => Promise<Branch | undefined>;
    getBranch?: (name: string) => Promise<Branch>;
}): Repository {
    return {
        rootUri: { fsPath: "/repo" } as Repository["rootUri"],
        state: {
            HEAD: overrides.head,
            onDidChange: vi.fn(),
        },
        getBranchBase: overrides.getBranchBase ?? vi.fn().mockRejectedValue(new Error("no base")),
        getBranch: overrides.getBranch ?? vi.fn().mockRejectedValue(new Error("missing")),
        getMergeBase: vi.fn(),
        diffBetweenWithStats: vi.fn(),
    };
}

describe("resolveBaseBranch", () => {
    it("uses getBranchBase when available", async () => {
        const repo = mockRepository({
            head: { type: RefType.Head, name: "feature/x", commit: "abc" },
            getBranchBase: vi.fn().mockResolvedValue({
                type: RefType.RemoteHead,
                name: "main",
                remote: "origin",
                commit: "def",
            }),
        });

        const base = await resolveBaseBranch(repo);
        expect(base).toEqual({ name: "origin/main", ref: "def" });
    });

    it("falls back to main when getBranchBase fails", async () => {
        const repo = mockRepository({
            head: { type: RefType.Head, name: "feature/x", commit: "abc" },
            getBranch: vi.fn().mockImplementation(async (name: string) => {
                if (name === "main") {
                    return { type: RefType.Head, name: "main", commit: "def" };
                }
                throw new Error("missing");
            }),
        });

        const base = await resolveBaseBranch(repo);
        expect(base).toEqual({ name: "main", ref: "def" });
    });

    it("skips base that matches current branch", async () => {
        const repo = mockRepository({
            head: { type: RefType.Head, name: "main", commit: "abc" },
            getBranch: vi.fn().mockImplementation(async (name: string) => {
                if (name === "main") {
                    return { type: RefType.Head, name: "main", commit: "abc" };
                }
                if (name === "master") {
                    return { type: RefType.Head, name: "master", commit: "def" };
                }
                throw new Error("missing");
            }),
        });

        const base = await resolveBaseBranch(repo);
        expect(base).toEqual({ name: "master", ref: "def" });
    });

    it("uses a workspace override when set", async () => {
        vi.mocked(getBaseBranchOverride).mockReturnValue("develop");
        const repo = mockRepository({
            head: { type: RefType.Head, name: "feature/x", commit: "abc" },
            getBranch: vi.fn().mockResolvedValue({
                type: RefType.Head,
                name: "develop",
                commit: "def",
            }),
        });

        const base = await resolveBaseBranch(repo);
        expect(base).toEqual({ name: "develop", ref: "def" });
    });
});

describe("formatBranchName", () => {
    it("formats remote branches", () => {
        expect(formatBranchName({ type: RefType.RemoteHead, name: "main", remote: "origin" })).toBe("origin/main");
    });
});

describe("isSameBranch", () => {
    it("matches shorthand names", () => {
        expect(isSameBranch("feature/x", "origin/feature/x")).toBe(true);
        expect(isSameBranch("main", "feature/x")).toBe(false);
    });
});

describe("isMainlineBranch", () => {
    it("matches main and master with or without origin prefix", () => {
        expect(isMainlineBranch("main")).toBe(true);
        expect(isMainlineBranch("master")).toBe(true);
        expect(isMainlineBranch("origin/main")).toBe(true);
        expect(isMainlineBranch("origin/master")).toBe(true);
        expect(isMainlineBranch("feature/x")).toBe(false);
    });
});
