import path from "path";
import { Uri, window } from "vscode";

const BRANCH_DIFF_SCHEME = "git-ref-compare";

type MultiDiffTabInput = {
    multiDiffSourceUri?: Uri;
};

let workingTreeFiles = new Set<string>();

function isMultiDiffTabInput(input: unknown): input is MultiDiffTabInput {
    return typeof input === "object" && input !== null && "multiDiffSourceUri" in input;
}

export function setBranchDiffWorkingTreeFiles(paths: string[]): void {
    workingTreeFiles = new Set(paths.map((filePath) => path.normalize(filePath)));
}

export function clearBranchDiffWorkingTreeFiles(): void {
    workingTreeFiles.clear();
}

export function isBranchDiffWorkingTreeFile(uri: Uri): boolean {
    return uri.scheme === "file" && workingTreeFiles.has(path.normalize(uri.fsPath));
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
        clearBranchDiffWorkingTreeFiles();
    }
}
