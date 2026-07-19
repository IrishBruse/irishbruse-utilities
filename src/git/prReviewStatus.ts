import { getOriginUrl, getPrChangesUrl, parseGithubOwnerRepo, runGh } from "./githubUrl";

export type PrReviewStatus = {
    label: string;
    description?: string;
    url: string;
};

type ReviewComment = {
    authorLogin: string;
    url: string;
    createdAt: string;
};

type ReviewThread = {
    isResolved: boolean;
    isOutdated: boolean;
    comments: ReviewComment[];
};

type ReviewStatusPayload = {
    viewerLogin: string;
    prUrl: string;
    reviewDecision: string | null;
    reviewRequestsCount: number;
    threads: ReviewThread[];
};

const REVIEW_STATUS_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      url
      reviewDecision
      reviewRequests(first: 100) { totalCount }
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          comments(first: 100) {
            nodes {
              author { login }
              url
              createdAt
            }
          }
        }
      }
    }
  }
}
`.replace(/\s+/g, " ");

function parseReviewStatusPayload(stdout: string): ReviewStatusPayload | undefined {
    try {
        const parsed = JSON.parse(stdout) as {
            data?: {
                viewer?: { login?: string };
                repository?: {
                    pullRequest?: {
                        url?: string;
                        reviewDecision?: string | null;
                        reviewRequests?: { totalCount?: number };
                        reviewThreads?: {
                            nodes?: Array<{
                                isResolved?: boolean;
                                isOutdated?: boolean;
                                comments?: {
                                    nodes?: Array<{
                                        author?: { login?: string };
                                        url?: string;
                                        createdAt?: string;
                                    }>;
                                };
                            }>;
                        };
                    };
                };
            };
        };

        const pullRequest = parsed.data?.repository?.pullRequest;
        const viewerLogin = parsed.data?.viewer?.login;
        if (!pullRequest?.url || !viewerLogin) {
            return undefined;
        }

        const threads =
            pullRequest.reviewThreads?.nodes?.map((thread) => ({
                isResolved: thread.isResolved ?? false,
                isOutdated: thread.isOutdated ?? false,
                comments:
                    thread.comments?.nodes
                        ?.filter((comment) => comment.author?.login && comment.url && comment.createdAt)
                        .map((comment) => ({
                            authorLogin: comment.author!.login!,
                            url: comment.url!,
                            createdAt: comment.createdAt!,
                        })) ?? [],
            })) ?? [];

        return {
            viewerLogin,
            prUrl: pullRequest.url,
            reviewDecision: pullRequest.reviewDecision ?? null,
            reviewRequestsCount: pullRequest.reviewRequests?.totalCount ?? 0,
            threads,
        };
    } catch {
        return undefined;
    }
}

function viewerHasUnansweredReplies(
    viewerLogin: string,
    threads: readonly ReviewThread[]
): { count: number; url: string } | undefined {
    let count = 0;
    let latestUrl = "";
    let latestAt = "";

    for (const thread of threads) {
        if (thread.isResolved || thread.isOutdated || thread.comments.length < 2) {
            continue;
        }

        const viewerParticipated = thread.comments.some((comment) => comment.authorLogin === viewerLogin);
        if (!viewerParticipated) {
            continue;
        }

        const lastComment = thread.comments[thread.comments.length - 1];
        if (lastComment.authorLogin === viewerLogin) {
            continue;
        }

        count += 1;
        if (!latestAt || lastComment.createdAt > latestAt) {
            latestAt = lastComment.createdAt;
            latestUrl = lastComment.url;
        }
    }

    if (count === 0) {
        return undefined;
    }

    return { count, url: latestUrl };
}

function countUnresolvedThreads(threads: readonly ReviewThread[]): number {
    return threads.filter((thread) => !thread.isResolved && !thread.isOutdated).length;
}

export function buildPrReviewStatus(payload: ReviewStatusPayload): PrReviewStatus | undefined {
    const repliesWaiting = viewerHasUnansweredReplies(payload.viewerLogin, payload.threads);
    if (repliesWaiting) {
        return {
            label: repliesWaiting.count === 1 ? "1 reply" : `${repliesWaiting.count} replies`,
            description: "Your turn",
            url: repliesWaiting.url,
        };
    }

    if (payload.reviewDecision === "CHANGES_REQUESTED") {
        return {
            label: "Changes requested",
            description: "Review feedback",
            url: getPrChangesUrl(payload.prUrl),
        };
    }

    const unresolvedCount = countUnresolvedThreads(payload.threads);
    if (unresolvedCount > 0) {
        return {
            label: unresolvedCount === 1 ? "1 unresolved" : `${unresolvedCount} unresolved`,
            description: "Conversation",
            url: payload.prUrl,
        };
    }

    if (payload.reviewRequestsCount > 0) {
        return {
            label:
                payload.reviewRequestsCount === 1
                    ? "1 requested"
                    : `${payload.reviewRequestsCount} requested`,
            description: "Awaiting reviewers",
            url: payload.prUrl,
        };
    }

    return undefined;
}

export async function getPrReviewStatus(
    repoRoot: string,
    prNumber: number
): Promise<PrReviewStatus | undefined> {
    const origin = await getOriginUrl(repoRoot);
    const github = origin ? parseGithubOwnerRepo(origin) : undefined;
    if (!github) {
        return undefined;
    }

    const result = await runGh(repoRoot, [
        "api",
        "graphql",
        "-f",
        `owner=${github.owner}`,
        "-f",
        `repo=${github.repo}`,
        "-F",
        `number=${prNumber}`,
        "-f",
        `query=${REVIEW_STATUS_QUERY}`,
    ]);
    if (result?.status !== 0) {
        return undefined;
    }

    const payload = parseReviewStatusPayload(result.stdout);
    if (!payload) {
        return undefined;
    }

    return buildPrReviewStatus(payload);
}
