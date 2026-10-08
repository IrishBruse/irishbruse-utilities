export const GIT_HELPER_DATA_FRESH_MS = 15_000;
export const GIT_HELPER_REFRESH_VISUAL_MS = 450;
export const GIT_HELPERS_REFRESHING_CONTEXT = "ib-utilities.gitHelpers.refreshing";

export type GitHelperRefreshPlan = "background" | "loading";

export function planGitHelperRefresh(hasCachedChildren: boolean): GitHelperRefreshPlan {
    return hasCachedChildren ? "background" : "loading";
}

export function refreshVisualHoldMs(
    startedAt: number,
    now: number,
    minimumMs = GIT_HELPER_REFRESH_VISUAL_MS
): number {
    return Math.max(0, minimumMs - (now - startedAt));
}
