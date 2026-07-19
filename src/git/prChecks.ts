import { getOriginUrl, parseGithubOwnerRepo, runGh } from "./githubUrl";

export type FailedPrCheck = {
    name: string;
    logUrl: string;
};

const FAILED_CHECK_CONCLUSIONS = new Set(["failure", "timed_out", "action_required", "startup_failure"]);
const FAILED_STATUS_STATES = new Set(["failure", "error"]);

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

export async function getFailedPrCheck(repoRoot: string, headRefOid: string): Promise<FailedPrCheck | undefined> {
    const origin = await getOriginUrl(repoRoot);
    const github = origin ? parseGithubOwnerRepo(origin) : undefined;
    if (!github) {
        return undefined;
    }

    const checkRuns = await runGh(repoRoot, [
        "api",
        `repos/${github.owner}/${github.repo}/commits/${headRefOid}/check-runs`,
        "-f",
        "per_page=100",
    ]);
    if (checkRuns?.status === 0) {
        try {
            const parsed = JSON.parse(checkRuns.stdout) as { check_runs?: CheckRun[] };
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
