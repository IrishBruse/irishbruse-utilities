import path from "path";
import {
    Comment,
    CommentController,
    CommentMode,
    CommentReply,
    CommentThread,
    CommentThreadCollapsibleState,
    comments,
    ExtensionContext,
    MarkdownString,
    Range,
    TextEditor,
    window,
} from "vscode";
import { Commands } from "../constants";
import { registerCommandIB } from "../utils/vscode";
import {
    noteMatchesGitUri,
    parseGitDocumentUri,
    repoRelativePath,
    sideFromGitRef,
    uriForNote,
    type NoteUriRefs,
} from "./gitDocument";
import { getGitApi, getRepositoryByRoot } from "./getGitApi";
import {
    addReviewNote,
    deleteReviewNote,
    loadReviewNotes,
    updateReviewNote,
    type ReviewNote,
    type ReviewNoteSide,
} from "./reviewNotes";
import { resolveBaseBranch, resolveMergeBaseSha } from "./resolveBaseBranch";

const CONTROLLER_ID = "ib-utilities.review";
const AUTHOR = { name: "Review note" };

type ThreadMeta = {
    repoRoot: string;
    branch: string;
    baseBranch: string;
    file: string;
    line: number;
    side: ReviewNoteSide;
    isDraft: boolean;
    noteId?: string;
};

type ReviewComment = Comment & {
    savedBody: string | MarkdownString;
    parent?: CommentThread;
};

let instance: ReviewCommentController | undefined;

export function getReviewCommentController(): ReviewCommentController | undefined {
    return instance;
}

export function activateReviewCommentController(context: ExtensionContext): ReviewCommentController {
    const controller = new ReviewCommentController(context);
    instance = controller;
    return controller;
}

export class ReviewCommentController {
    private readonly controller: CommentController;
    private readonly threadMeta = new WeakMap<CommentThread, ThreadMeta>();
    private readonly commentSavedBody = new WeakMap<Comment, string | MarkdownString>();
    private readonly threadByNoteId = new Map<string, CommentThread>();
    private readonly draftThreads = new Set<CommentThread>();
    private activeRepoRoot: string | undefined;

    constructor(context: ExtensionContext) {
        this.controller = comments.createCommentController(CONTROLLER_ID, "Review note");
        this.controller.options = {
            prompt: "Why was this change made?",
            placeHolder: "Review note (Markdown supported)",
        };

        context.subscriptions.push(this.controller);
        context.subscriptions.push(
            window.onDidChangeActiveTextEditor((editor) => {
                if (editor?.document.uri.scheme === "git") {
                    const repoRoot = this.repoRootForEditor(editor);
                    if (repoRoot) {
                        void this.refreshForRepo(repoRoot);
                    }
                }
            })
        );

        registerCommandIB(Commands.ReviewCommentCreate, (reply) => this.handleCreate(reply), context);
        registerCommandIB(Commands.ReviewCommentSave, (comment) => this.handleSave(comment), context);
        registerCommandIB(Commands.ReviewCommentCancel, (comment) => this.handleCancel(comment), context);
        registerCommandIB(Commands.ReviewCommentDelete, (thread) => this.handleDelete(thread), context);
        registerCommandIB(Commands.ReviewCommentEdit, (comment) => this.handleEdit(comment), context);
    }

    dispose(): void {
        this.clearThreads();
        instance = undefined;
    }

    async refreshForRepo(repoRoot: string): Promise<void> {
        const repository = getRepositoryByRoot(repoRoot);
        const head = repository?.state.HEAD;
        if (!head?.name) {
            return;
        }

        this.activeRepoRoot = repoRoot;
        const data = await loadReviewNotes(repoRoot, head.name);
        const refs = await this.resolveRefs(repoRoot);
        const mergeBaseSha = refs?.mergeBaseRef;

        const existingIds = new Set(data.notes.map((n) => n.id));
        for (const [noteId, thread] of [...this.threadByNoteId.entries()]) {
            if (!existingIds.has(noteId)) {
                thread.dispose();
                this.threadByNoteId.delete(noteId);
            }
        }

        for (const note of data.notes) {
            if (this.threadByNoteId.has(note.id)) {
                this.updateThreadBody(this.threadByNoteId.get(note.id)!, note);
                continue;
            }
            const uri = this.resolveUriForNote(repoRoot, note, refs, mergeBaseSha);
            if (!uri) {
                continue;
            }
            this.createThreadForNote(uri, note, repoRoot, data.baseBranch, head.name);
        }
    }

    async startDraftAtCursor(repoRoot: string): Promise<void> {
        const editor = window.activeTextEditor;
        if (!editor) {
            window.showWarningMessage("Open a git diff to add a review note.");
            return;
        }

        const repository = getRepositoryByRoot(repoRoot);
        const head = repository?.state.HEAD;
        if (!head?.name) {
            window.showWarningMessage("Could not determine current branch.");
            return;
        }

        const file = repoRelativePath(editor.document.uri, repoRoot);
        if (!file) {
            window.showWarningMessage("Open a file in this repository to add a review note.");
            return;
        }

        const baseBranch = (await resolveBaseBranch(repository!))?.name ?? "main";
        const refs = await this.resolveRefs(repoRoot);
        const mergeBaseSha = refs?.mergeBaseRef;
        const parsed = parseGitDocumentUri(editor.document.uri);
        const side = parsed ? sideFromGitRef(parsed.ref, mergeBaseSha) : "RIGHT";
        const line = editor.selection.active.line + 1;

        this.disposeDraftThreads();

        const range = new Range(line - 1, 0, line - 1, 0);
        const thread = this.controller.createCommentThread(editor.document.uri, range, []);
        const comment = this.makeComment("", CommentMode.Editing, thread);
        thread.comments = [comment];
        thread.collapsibleState = CommentThreadCollapsibleState.Expanded;
        thread.contextValue = "draft";

        this.draftThreads.add(thread);
        this.threadMeta.set(thread, {
            repoRoot,
            branch: head.name,
            baseBranch,
            file: file.replace(/\\/g, "/"),
            line,
            side,
            isDraft: true,
        });
    }

    private async handleCreate(reply: CommentReply): Promise<void> {
        const text = this.commentText(reply.text);
        if (!text) {
            return;
        }
        await this.persistThread(reply.thread, text);
    }

    private async handleSave(comment: ReviewComment): Promise<void> {
        const thread = comment.parent;
        if (!thread) {
            return;
        }

        const text = this.commentText(comment.body);
        if (!text) {
            window.showWarningMessage("Review note cannot be empty.");
            return;
        }

        const meta = this.threadMeta.get(thread);
        if (!meta) {
            return;
        }

        if (meta.isDraft) {
            await this.persistThread(thread, text);
            return;
        }

        if (!meta.noteId) {
            return;
        }

        await updateReviewNote(meta.repoRoot, meta.branch, meta.noteId, text);
        comment.savedBody = comment.body;
        comment.mode = CommentMode.Preview;
        this.commentSavedBody.set(comment, comment.body);
    }

    private handleCancel(comment: ReviewComment): void {
        const thread = comment.parent;
        if (!thread) {
            return;
        }

        const meta = this.threadMeta.get(thread);
        if (!meta) {
            return;
        }

        if (meta.isDraft) {
            this.draftThreads.delete(thread);
            thread.dispose();
            return;
        }

        comment.body = comment.savedBody ?? this.commentSavedBody.get(comment) ?? comment.body;
        comment.mode = CommentMode.Preview;
    }

    private async handleDelete(thread: CommentThread): Promise<void> {
        const meta = this.threadMeta.get(thread);
        if (!meta) {
            thread.dispose();
            return;
        }

        if (meta.isDraft) {
            this.draftThreads.delete(thread);
            thread.dispose();
            return;
        }

        if (meta.noteId) {
            await deleteReviewNote(meta.repoRoot, meta.branch, meta.noteId);
            this.threadByNoteId.delete(meta.noteId);
        }
        thread.dispose();
    }

    private handleEdit(comment: ReviewComment): void {
        this.commentSavedBody.set(comment, comment.body);
        comment.mode = CommentMode.Editing;
    }

    private async persistThread(thread: CommentThread, body: string): Promise<void> {
        const meta = this.threadMeta.get(thread);
        if (!meta) {
            return;
        }

        if (meta.isDraft) {
            const note = await addReviewNote(
                meta.repoRoot,
                meta.branch,
                meta.baseBranch,
                meta.file,
                meta.line,
                meta.side,
                body
            );
            meta.isDraft = false;
            meta.noteId = note.id;
            thread.contextValue = undefined;
            thread.collapsibleState = CommentThreadCollapsibleState.Collapsed;
            this.draftThreads.delete(thread);
            this.threadByNoteId.set(note.id, thread);

            const comment = thread.comments[0] as ReviewComment;
            comment.body = body;
            comment.mode = CommentMode.Preview;
            comment.savedBody = body;
            return;
        }

        if (meta.noteId) {
            await updateReviewNote(meta.repoRoot, meta.branch, meta.noteId, body);
        }
    }

    private createThreadForNote(
        uri: import("vscode").Uri,
        note: ReviewNote,
        repoRoot: string,
        baseBranch: string,
        branch: string
    ): void {
        const line = Math.max(0, note.line - 1);
        const range = new Range(line, 0, line, 0);
        const thread = this.controller.createCommentThread(uri, range, []);
        const comment = this.makeComment(note.body, CommentMode.Preview, thread);
        thread.comments = [comment];
        thread.collapsibleState = CommentThreadCollapsibleState.Collapsed;
        if (note.published) {
            thread.contextValue = "published";
        }

        this.threadMeta.set(thread, {
            repoRoot,
            branch,
            baseBranch,
            file: note.file,
            line: note.line,
            side: note.side,
            isDraft: false,
            noteId: note.id,
        });

        this.threadByNoteId.set(note.id, thread);
    }

    private updateThreadBody(thread: CommentThread, note: ReviewNote): void {
        if (thread.comments.length === 0) {
            thread.comments = [this.makeComment(note.body, CommentMode.Preview, thread)];
            return;
        }
        const comment = thread.comments[0] as ReviewComment;
        comment.parent = thread;
        comment.body = note.body;
        comment.savedBody = note.body;
        comment.mode = CommentMode.Preview;
        thread.contextValue = note.published ? "published" : undefined;
    }

    private resolveUriForNote(
        repoRoot: string,
        note: ReviewNote,
        refs: NoteUriRefs | undefined,
        mergeBaseSha?: string
    ): import("vscode").Uri | undefined {
        for (const editor of window.visibleTextEditors) {
            if (noteMatchesGitUri(note, editor.document.uri, repoRoot, mergeBaseSha)) {
                return editor.document.uri;
            }
        }

        if (!refs) {
            return undefined;
        }
        return uriForNote(repoRoot, note, refs);
    }

    private async resolveRefs(repoRoot: string): Promise<NoteUriRefs | undefined> {
        const repository = getRepositoryByRoot(repoRoot);
        if (!repository) {
            return undefined;
        }
        const base = await resolveBaseBranch(repository);
        const mergeBase = base ? await resolveMergeBaseSha(repository, base) : undefined;
        return {
            headRef: "HEAD",
            mergeBaseRef: mergeBase ?? base?.ref ?? "",
        };
    }

    private repoRootForEditor(editor: TextEditor): string | undefined {
        const parsed = parseGitDocumentUri(editor.document.uri);
        if (!parsed) {
            return undefined;
        }
        const gitApi = getGitApi();
        if (!gitApi) {
            return this.activeRepoRoot;
        }
        const filePath = path.normalize(parsed.filePath);
        for (const repo of gitApi.repositories) {
            const root = path.normalize(repo.rootUri.fsPath);
            if (filePath === root || filePath.startsWith(root + path.sep)) {
                return repo.rootUri.fsPath;
            }
        }
        return this.activeRepoRoot;
    }

    private makeComment(body: string, mode: CommentMode, parent?: CommentThread): ReviewComment {
        const comment: ReviewComment = {
            body,
            mode,
            author: AUTHOR,
            savedBody: body,
            parent,
        };
        this.commentSavedBody.set(comment, body);
        return comment;
    }

    private commentText(body: string | MarkdownString): string {
        return typeof body === "string" ? body.trim() : body.value.trim();
    }

    private disposeDraftThreads(): void {
        for (const thread of this.draftThreads) {
            thread.dispose();
        }
        this.draftThreads.clear();
    }

    private clearThreads(): void {
        for (const thread of this.threadByNoteId.values()) {
            thread.dispose();
        }
        this.threadByNoteId.clear();
    }
}
