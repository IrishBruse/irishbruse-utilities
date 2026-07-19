import { describe, expect, it } from "vitest";
import { isCacheableGitHelperChildren, RepoChildrenCache } from "./repoChildrenCache";

describe("isCacheableGitHelperChildren", () => {
    it("accepts children tied to a repository", () => {
        expect(isCacheableGitHelperChildren([{ id: "repo:diff", repoRoot: "/repo" }])).toBe(true);
    });

    it("rejects loading placeholders", () => {
        expect(isCacheableGitHelperChildren([{ id: "info:loading" }])).toBe(false);
    });

    it("rejects generic info rows without a repository", () => {
        expect(isCacheableGitHelperChildren([{ id: "info:select-repo" }])).toBe(false);
    });
});

describe("RepoChildrenCache", () => {
    it("stores and retrieves cacheable children by repo root", () => {
        const cache = new RepoChildrenCache<{ id?: string; repoRoot?: string }>();
        const children = [{ id: "repo:diff", repoRoot: "/repo" }];

        cache.set("/repo", children, "sig");
        expect(cache.get("/repo")).toEqual({ children, signature: "sig" });
    });

    it("ignores non-cacheable children", () => {
        const cache = new RepoChildrenCache<{ id?: string; repoRoot?: string }>();
        cache.set("/repo", [{ id: "info:loading" }], "sig");
        expect(cache.get("/repo")).toBeUndefined();
    });

    it("deletes entries for a repository", () => {
        const cache = new RepoChildrenCache<{ id?: string; repoRoot?: string }>();
        cache.set("/repo", [{ id: "repo:diff", repoRoot: "/repo" }], "sig");

        cache.delete("/repo");
        expect(cache.get("/repo")).toBeUndefined();
    });
});
