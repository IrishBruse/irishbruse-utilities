import { getOriginUrl, parseGithubOwnerRepo, runGh } from "./githubUrl";

export type FailedPrCheck = {
    name: string;
    logUrl: string;
};

export type PrCheckStatus = {
    label: string;
    description: string;
    url: string;
    isFailing: boolean;
};

const FAILED_CHECK_CONCLUSIONS = new Set(["failure", "timed_out", "action_required", "startup_failure"]);
const SUCCESS_CHECK_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);
const PENDING_CHECK_CONCLUSIONS = new Set(["", "pending", "queued", "in_progress", "waiting", "requested"]);
const FAILED_STATUS_STATES = new Set(["failure", "error"]);
const PENDING_STATUS_STATES = new Set(["pending"]);

type CheckRun = {
    name: string;
    conclusion: string | null;
    details_url: string | null;
    html_url: string;
};

type CommitStatus = {
    state: string;
    statuses: Array<{
        state: string;
        context: string;
        target_url: string | null;
    }>;
};

function checksPageUrl(prUrl: string): string {
    return `${prUrl.replace(/\/$/, "")}/checks`;
}

function pickFailedCheckRun(checkRuns: CheckRun[]): FailedPrCheck | undefined {
    const failed = checkRuns.find((run) => run.conclusion && FAILED_CHECK_CONCLUSIONS.has(run.conclusion));
    if (!failed) {
        return undefined;
    }

    const logUrl = failed.details_url ?? failed.html_url;
    if (!logUrl) {
        return undefined;
    }

    return { name: failed.name, logUrl };
}

function pickFailedCommitStatus(status: CommitStatus): FailedPrCheck | undefined {
    if (!FAILED_STATUS_STATES.has(status.state)) {
        return undefined;
    }

    const failed = status.statuses.find((entry) => FAILED_STATUS_STATES.has(entry.state));
    if (!failed) {
        return undefined;
    }

    const logUrl = failed.target_url;
    if (!logUrl) {
        return undefined;
    }

    return { name: failed.context, logUrl };
}

export function buildPrCheckStatus(
    checkRuns: readonly CheckRun[],
    commitStatus: CommitStatus | undefined,
    prUrl: string
): PrCheckStatus | undefined {
    const checksUrl = checksPageUrl(prUrl);

    if (checkRuns.length > 0) {
        const failed = pickFailedCheckRun([...checkRuns]);
        if (failed) {
            return {
                label: failed.name,
                description: "Checks failing",
                url: failed.logUrl,
                isFailing: true,
            };
        }

        const pending = checkRuns.some(
            (run) => !run.conclusion || PENDING_CHECK_CONCLUSIONS.has(run.conclusion)
        );
        if (pending) {
            return {
                label: "Checks",
                description: "Pending",
                url: checksUrl,
                isFailing: false,
            };
        }

        const passing = checkRuns.filter(
            (run) => run.conclusion && SUCCESS_CHECK_CONCLUSIONS.has(run.conclusion)
        ).length;
        const total = checkRuns.length;
        return {
            label: "Checks",
            description: passing === total ? "All green" : `${passing}/${total} passing`,
            url: checksUrl,
            isFailing: false,
        };
    }

    if (commitStatus && commitStatus.statuses.length > 0) {
        const failed = pickFailedCommitStatus(commitStatus);
        if (failed) {
            return {
                label: failed.name,
                description: "Checks failing",
                url: failed.logUrl,
                isFailing: true,
            };
        }

        if (PENDING_STATUS_STATES.has(commitStatus.state)) {
            return {
                label: "Checks",
                description: "Pending",
                url: checksUrl,
                isFailing: false,
            };
        }

        if (commitStatus.state === "success") {
            return {
                label: "Checks",
                description: "All green",
                url: checksUrl,
                isFailing: false,
            };
        }
    }

    return undefined;
}

async function fetchCheckRuns(
    repoRoot: string,
    headRefOid: string
): Promise<{ checkRuns: CheckRun[]; commitStatus?: CommitStatus } | undefined> {
    const origin = await getOriginUrl(repoRoot);
    const github = origin ? parseGithubOwnerRepo(origin) : undefined;
    if (!github) {
        return undefined;
    }

    let checkRuns: CheckRun[] = [];
    const checkRunsResult = await runGh(repoRoot, [
        "api",
        `repos/${github.owner}/${github.repo}/commits/${headRefOid}/check-runs`,
        "-f",
        "per_page=100",
    ]);
    if (checkRunsResult?.status === 0) {
        try {
            const parsed = JSON.parse(checkRunsResult.stdout) as { check_runs?: CheckRun[] };
            checkRuns = parsed.check_runs ?? [];
        } catch {
            checkRuns = [];
        }
    }

    let commitStatus: CommitStatus | undefined;
    const combinedStatus = await runGh(repoRoot, [
        "api",
        `repos/${github.owner}/${github.repo}/commits/${headRefOid}/status`,
    ]);
    if (combinedStatus?.status === 0) {
        try {
            commitStatus = JSON.parse(combinedStatus.stdout) as CommitStatus;
        } catch {
            commitStatus = undefined;
        }
    }

    return { checkRuns, commitStatus };
}

export async function getPrCheckStatus(
    repoRoot: string,
    headRefOid: string,
    prUrl: string
): Promise<PrCheckStatus | undefined> {
    const payload = await fetchCheckRuns(repoRoot, headRefOid);
    if (!payload) {
        return undefined;
    }

    return buildPrCheckStatus(payload.checkRuns, payload.commitStatus, prUrl);
}

export async function getFailedPrCheck(repoRoot: string, headRefOid: string): Promise<FailedPrCheck | undefined> {
    const origin = await getOriginUrl(repoRoot);
    const github = origin ? parseGithubOwnerRepo(origin) : undefined;
    if (!github) {
        return undefined;
    }

    const checkRunsResult = await runGh(repoRoot, [
        "api",
        `repos/${github.owner}/${github.repo}/commits/${headRefOid}/check-runs`,
        "-f",
        "per_page=100",
    ]);
    if (checkRunsResult?.status === 0) {
        try {
            const parsed = JSON.parse(checkRunsResult.stdout) as { check_runs?: CheckRun[] };
            const failed = pickFailedCheckRun(parsed.check_runs ?? []);
            if (failed) {
                return failed;
            }
        } catch {
            // fall through to combined status
        }
    }

    const combinedStatus = await runGh(repoRoot, [
        "api",
        `repos/${github.owner}/${github.repo}/commits/${headRefOid}/status`,
    ]);
    if (combinedStatus?.status !== 0) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(combinedStatus.stdout) as CommitStatus;
        return pickFailedCommitStatus(parsed);
    } catch {
        return undefined;
    }
}
