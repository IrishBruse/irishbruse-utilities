import { describe, expect, it } from "vitest";
import { buildPrReviewStatus } from "./prReviewStatus";

const basePayload = {
    viewerLogin: "alice",
    prUrl: "https://github.com/o/r/pull/7",
    reviewDecision: null,
    reviewRequestsCount: 0,
    threads: [] as Array<{
        isResolved: boolean;
        isOutdated: boolean;
        comments: Array<{ authorLogin: string; url: string; createdAt: string }>;
    }>,
};

describe("buildPrReviewStatus", () => {
    it("prioritizes replies waiting on the viewer", () => {
        const status = buildPrReviewStatus({
            ...basePayload,
            reviewDecision: "CHANGES_REQUESTED",
            threads: [
                {
                    isResolved: false,
                    isOutdated: false,
                    comments: [
                        {
                            authorLogin: "alice",
                            url: "https://github.com/o/r/pull/7#discussion_r1",
                            createdAt: "2026-01-01T00:00:00Z",
                        },
                        {
                            authorLogin: "bob",
                            url: "https://github.com/o/r/pull/7#discussion_r2",
                            createdAt: "2026-01-02T00:00:00Z",
                        },
                    ],
                },
            ],
        });

        expect(status).toEqual({
            label: "1 reply",
            description: "Your turn",
            url: "https://github.com/o/r/pull/7#discussion_r2",
        });
    });

    it("shows changes requested when no replies are waiting", () => {
        const status = buildPrReviewStatus({
            ...basePayload,
            reviewDecision: "CHANGES_REQUESTED",
            threads: [
                {
                    isResolved: false,
                    isOutdated: false,
                    comments: [
                        {
                            authorLogin: "bob",
                            url: "https://github.com/o/r/pull/7#discussion_r1",
                            createdAt: "2026-01-01T00:00:00Z",
                        },
                    ],
                },
            ],
        });

        expect(status).toEqual({
            label: "Changes requested",
            description: "Review feedback",
            url: "https://github.com/o/r/pull/7/changes",
        });
    });

    it("shows unresolved threads before awaiting reviewers", () => {
        const status = buildPrReviewStatus({
            ...basePayload,
            reviewRequestsCount: 2,
            threads: [
                {
                    isResolved: false,
                    isOutdated: false,
                    comments: [
                        {
                            authorLogin: "bob",
                            url: "https://github.com/o/r/pull/7#discussion_r1",
                            createdAt: "2026-01-01T00:00:00Z",
                        },
                    ],
                },
                {
                    isResolved: false,
                    isOutdated: false,
                    comments: [
                        {
                            authorLogin: "carol",
                            url: "https://github.com/o/r/pull/7#discussion_r2",
                            createdAt: "2026-01-02T00:00:00Z",
                        },
                    ],
                },
            ],
        });

        expect(status).toEqual({
            label: "2 unresolved",
            description: "Conversation",
            url: "https://github.com/o/r/pull/7",
        });
    });

    it("shows awaiting reviewers when nothing else needs attention", () => {
        const status = buildPrReviewStatus({
            ...basePayload,
            reviewRequestsCount: 2,
        });

        expect(status).toEqual({
            label: "2 requested",
            description: "Awaiting reviewers",
            url: "https://github.com/o/r/pull/7",
        });
    });

    it("returns undefined when there is no review activity", () => {
        expect(buildPrReviewStatus(basePayload)).toBeUndefined();
    });
});
