import path from "path";
import { Uri, window } from "vscode";

const BRANCH_DIFF_SCHEME = "git-ref-compare";

export type BranchDiffSession = {
    repoRoot: string;
    mergeBaseRef: string;
    files: Set<string>;
};

type MultiDiffTabInput = {
    multiDiffSourceUri?: Uri;
};

let session: BranchDiffSession | undefined;

function isMultiDiffTabInput(input: unknown): input is MultiDiffTabInput {
    return typeof input === "object" && input !== null && "multiDiffSourceUri" in input;
}

export function setBranchDiffSession(repoRoot: string, mergeBaseRef: string, paths: string[]): void {
    session = {
        repoRoot,
        mergeBaseRef,
        files: new Set(paths.map((filePath) => path.normalize(filePath))),
    };
}

export function getBranchDiffSession(): BranchDiffSession | undefined {
    return session;
}

export function clearBranchDiffSession(): void {
    session = undefined;
}

export function setBranchDiffWorkingTreeFiles(paths: string[]): void {
    if (!session) {
        session = {
            repoRoot: "",
            mergeBaseRef: "",
            files: new Set(paths.map((filePath) => path.normalize(filePath))),
        };
        return;
    }
    session = {
        ...session,
        files: new Set(paths.map((filePath) => path.normalize(filePath))),
    };
}

export function clearBranchDiffWorkingTreeFiles(): void {
    clearBranchDiffSession();
}

export function isBranchDiffWorkingTreeFile(uri: Uri): boolean {
    return uri.scheme === "file" && (session?.files.has(path.normalize(uri.fsPath)) ?? false);
}

export function workingTreeUriForBranchDiffFile(repoRoot: string, relativePath: string): Uri | undefined {
    if (!session || session.repoRoot !== repoRoot) {
        return undefined;
    }
    const absPath = path.normalize(path.join(repoRoot, relativePath));
    if (!session.files.has(absPath)) {
        return undefined;
    }
    return Uri.file(absPath);
}

export function hasOpenBranchDiffEditor(): boolean {
    for (const group of window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            if (
                isMultiDiffTabInput(input) &&
                input.multiDiffSourceUri?.scheme === BRANCH_DIFF_SCHEME
            ) {
                return true;
            }
        }
    }
    return false;
}

export function syncBranchDiffWorkingTreeFiles(): void {
    if (!hasOpenBranchDiffEditor()) {
        clearBranchDiffSession();
    }
}
