/**
 * Minimal types for the built-in vscode.git extension API.
 * @see https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts
 */

import type { Event, Uri } from "vscode";

export const enum RefType {
    Head,
    RemoteHead,
    Tag,
}

export const enum Status {
    INDEX_MODIFIED,
    INDEX_ADDED,
    INDEX_DELETED,
    INDEX_RENAMED,
    INDEX_COPIED,
    MODIFIED,
    DELETED,
    UNTRACKED,
    IGNORED,
    INTENT_TO_ADD,
    INTENT_TO_RENAME,
    TYPE_CHANGED,
    ADDED_BY_US,
    ADDED_BY_THEM,
    DELETED_BY_US,
    DELETED_BY_THEM,
    BOTH_ADDED,
    BOTH_DELETED,
    BOTH_MODIFIED,
}

export interface Branch {
    readonly type: RefType;
    readonly name?: string;
    readonly commit?: string;
    readonly remote?: string;
}

export interface Change {
    readonly uri: Uri;
    readonly originalUri: Uri;
    readonly renameUri: Uri | undefined;
    readonly status: Status;
}

export interface DiffChange extends Change {
    readonly insertions: number;
    readonly deletions: number;
}

export interface RepositoryState {
    readonly HEAD: Branch | undefined;
    readonly onDidChange: Event<void>;
}

export interface Repository {
    readonly rootUri: Uri;
    readonly state: RepositoryState;
    getBranch(name: string): Promise<Branch>;
    getBranchBase(name: string): Promise<Branch | undefined>;
    getMergeBase(ref1: string, ref2: string): Promise<string | undefined>;
    diffBetweenWithStats(ref1: string, ref2: string): Promise<DiffChange[]>;
}

export type APIState = "uninitialized" | "initialized";

export interface API {
    readonly state: APIState;
    readonly onDidChangeState: Event<void>;
    readonly repositories: Repository[];
    readonly onDidOpenRepository: Event<{ repository: Repository }>;
    readonly onDidCloseRepository: Event<{ repository: Repository }>;
    toGitUri(uri: Uri, ref: string): Uri;
}

export interface GitExtension {
    readonly enabled: boolean;
    getAPI(version: 1): API;
}
