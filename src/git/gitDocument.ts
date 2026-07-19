import path from "path";
import { Uri } from "vscode";
import { getBranchDiffSession } from "./branchDiffFiles";
import { getGitApi } from "./getGitApi";
import type { ReviewNote, ReviewNoteSide } from "./reviewNotes";
import { toGitUri } from "./gitUri";

export type ParsedGitDocument = {
    filePath: string;
    ref: string;
};

const RIGHT_REFS = new Set(["HEAD", "head", "index", ""]);

export function parseGitDocumentUri(uri: Uri): ParsedGitDocument | undefined {
    if (uri.scheme !== "git") {
        return undefined;
    }
    try {
        const params = JSON.parse(uri.query) as { path?: string; ref?: string };
        if (!params.path) {
            return undefined;
        }
        return {
            filePath: path.normalize(params.path),
            ref: params.ref ?? "",
        };
    } catch {
        return undefined;
    }
}

export function repoRootForDocumentUri(uri: Uri, activeRepoRoot?: string): string | undefined {
    if (uri.scheme === "git") {
        const parsed = parseGitDocumentUri(uri);
        if (!parsed) {
            return activeRepoRoot;
        }
        return repoRootContainingPath(parsed.filePath, activeRepoRoot);
    }

    const fsPath = path.normalize(uri.fsPath);
    const session = getBranchDiffSession();
    if (session?.repoRoot && session.files.has(fsPath)) {
        return session.repoRoot;
    }

    const gitApi = getGitApi();
    const fromGitApi = gitApi?.getRepository(uri)?.rootUri.fsPath;
    if (fromGitApi) {
        return fromGitApi;
    }

    return repoRootContainingPath(fsPath, activeRepoRoot);
}

function repoRootContainingPath(filePath: string, activeRepoRoot?: string): string | undefined {
    const normalizedPath = path.normalize(filePath);
    const gitApi = getGitApi();
    if (gitApi) {
        for (const repo of gitApi.repositories) {
            const root = path.normalize(repo.rootUri.fsPath);
            if (normalizedPath === root || normalizedPath.startsWith(root + path.sep)) {
                return repo.rootUri.fsPath;
            }
        }
    }
    return activeRepoRoot;
}

export function repoRelativePath(uri: Uri, repoRoot: string): string | undefined {
    const repoRootNorm = path.normalize(repoRoot);
    if (uri.scheme === "git") {
        const parsed = parseGitDocumentUri(uri);
        if (!parsed) {
            return undefined;
        }
        return path.relative(repoRootNorm, parsed.filePath).replace(/\\/g, "/");
    }
    const fsPath = path.normalize(uri.fsPath);
    if (fsPath.startsWith(repoRootNorm + path.sep) || fsPath === repoRootNorm) {
        return path.relative(repoRootNorm, fsPath).replace(/\\/g, "/");
    }
    return undefined;
}

export function sideFromGitRef(ref: string, mergeBaseSha?: string): ReviewNoteSide {
    if (mergeBaseSha && (ref === mergeBaseSha || ref.startsWith(mergeBaseSha.slice(0, 7)))) {
        return "LEFT";
    }
    if (RIGHT_REFS.has(ref)) {
        return "RIGHT";
    }
    return "RIGHT";
}

export type NoteUriRefs = {
    headRef: string;
    mergeBaseRef: string;
};

export function uriForNote(repoRoot: string, note: ReviewNote, refs: NoteUriRefs): Uri {
    const absPath = path.join(repoRoot, note.file);
    const fileUri = Uri.file(absPath);
    const ref = note.side === "LEFT" ? refs.mergeBaseRef : refs.headRef;
    return toGitUri(fileUri, ref);
}

export function noteMatchesGitUri(
    note: ReviewNote,
    uri: Uri,
    repoRoot: string,
    mergeBaseSha?: string
): boolean {
    const rel = repoRelativePath(uri, repoRoot);
    if (!rel || rel.replace(/\\/g, "/") !== note.file.replace(/\\/g, "/")) {
        return false;
    }
    if (uri.scheme !== "git") {
        return note.side === "RIGHT";
    }
    const parsed = parseGitDocumentUri(uri);
    if (!parsed) {
        return false;
    }
    return sideFromGitRef(parsed.ref, mergeBaseSha) === note.side;
}
