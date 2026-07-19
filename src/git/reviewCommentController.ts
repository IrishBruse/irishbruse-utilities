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
    Uri,
    window,
} from "vscode";
import { Commands } from "../constants";
import { registerCommandIB } from "../utils/vscode";
import { workingTreeUriForBranchDiffFile } from "./branchDiffFiles";
import {
    noteMatchesGitUri,
    parseGitDocumentUri,
    repoRelativePath,
    repoRootForDocumentUri,
    sideFromGitRef,
    uriForNote,
    type NoteUriRefs,
} from "./gitDocument";
import { getRepositoryByRoot } from "./getGitApi";
import {
    addReviewNote,
    deleteReviewNote,
    findNoteAtLocation,
    loadReviewNotes,
    updateReviewNote,
    type ReviewNote,
    type ReviewNoteSide,
} from "./reviewNotes";
import { resolveBaseBranch, resolveMergeBaseSha } from "./resolveBaseBranch";
import { refreshGitPanels } from "./refreshPanels";
import { isReviewCommentableDocument, reviewCommentingRanges } from "./reviewCommentingRanges";

const CONTROLLER_ID = "ib-utilities.review";
const AUTHOR = { name: "" };

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
    private readonly threadByNoteId = new Map<string, CommentThread>();
    private readonly draftThreads = new Set<CommentThread>();
    private activeRepoRoot: string | undefined;

    constructor(context: ExtensionContext) {
        this.controller = comments.createCommentController(CONTROLLER_ID, "Review note");
        this.controller.options = {
            prompt: "Why was this change made?",
            placeHolder: "Review note (Markdown supported)",
        };
        this.controller.commentingRangeProvider = {
            provideCommentingRanges: (document) => {
                if (!isReviewCommentableDocument(document.uri)) {
                    return null;
                }
                return {
                    ranges: reviewCommentingRanges(document.lineCount),
                    enableFileComments: false,
                };
            },
        };

        context.subscriptions.push(this.controller);
        context.subscriptions.push(
            window.onDidChangeActiveTextEditor((editor) => {
                if (editor && isReviewCommentableDocument(editor.document.uri)) {
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

        if (!isReviewCommentableDocument(editor.document.uri)) {
            window.showWarningMessage("Open a git diff to add a review note.");
            return;
        }

        const line = editor.selection.active.line + 1;
        const meta = await this.buildThreadMeta(editor.document.uri, line, true, repoRoot);
        if (!meta) {
            window.showWarningMessage("Open a file in this repository to add a review note.");
            return;
        }

        const range = new Range(line - 1, 0, line - 1, 0);
        const thread = this.controller.createCommentThread(editor.document.uri, range, []);
        this.configureThread(thread);
        thread.collapsibleState = CommentThreadCollapsibleState.Expanded;
        thread.contextValue = "draft";
        this.threadMeta.set(thread, meta);
        this.draftThreads.add(thread);
    }

    private async handleCreate(reply: CommentReply): Promise<void> {
        const thread = reply.thread;
        const text = this.commentText(reply.text);
        if (!text) {
            window.showWarningMessage("Review note cannot be empty.");
            return;
        }

        const meta = await this.ensureThreadMeta(thread);
        if (!meta) {
            return;
        }

        const data = await loadReviewNotes(meta.repoRoot, meta.branch);
        const existing = findNoteAtLocation(data, meta.file, meta.line, meta.side);
        const note = await this.saveNote(meta, existing, text);
        if (!note) {
            return;
        }

        await this.applySavedNote(thread, meta, note);
        refreshGitPanels();
    }

    private handleEdit(comment: ReviewComment): void {
        const thread = this.findThreadForComment(comment);
        if (!thread || this.isPublishedThread(thread)) {
            return;
        }

        comment.savedBody = comment.body;
        comment.mode = CommentMode.Editing;
        comment.contextValue = "editing";
    }

    private async handleSave(comment: ReviewComment): Promise<void> {
        const thread = this.findThreadForComment(comment);
        if (!thread || this.isPublishedThread(thread)) {
            return;
        }

        const text = this.commentText(comment.body);
        if (!text) {
            window.showWarningMessage("Review note cannot be empty.");
            return;
        }

        const meta = this.threadMeta.get(thread) ?? (await this.ensureThreadMeta(thread));
        if (!meta) {
            return;
        }

        const data = await loadReviewNotes(meta.repoRoot, meta.branch);
        const existing =
            (meta.noteId ? data.notes.find((note) => note.id === meta.noteId) : undefined) ??
            findNoteAtLocation(data, meta.file, meta.line, meta.side);
        const note = await this.saveNote(meta, existing, text);
        if (!note) {
            return;
        }

        await this.applySavedNote(thread, meta, note);
        comment.body = text;
        comment.savedBody = text;
        comment.mode = CommentMode.Preview;
        comment.contextValue = "note";
        refreshGitPanels();
    }

    private handleCancel(comment: ReviewComment): void {
        comment.body = comment.savedBody;
        comment.mode = CommentMode.Preview;
        comment.contextValue = "note";
    }

    private async applySavedNote(thread: CommentThread, meta: ThreadMeta, note: ReviewNote): Promise<void> {
        this.draftThreads.delete(thread);
        const savedMeta: ThreadMeta = {
            ...meta,
            isDraft: false,
            noteId: note.id,
        };
        this.threadMeta.set(thread, savedMeta);
        this.threadByNoteId.set(note.id, thread);
        this.updateThreadBody(thread, note);
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
        refreshGitPanels();
    }

    private async saveNote(
        meta: ThreadMeta,
        existing: ReviewNote | undefined,
        body: string
    ): Promise<ReviewNote | undefined> {
        if (existing) {
            return updateReviewNote(meta.repoRoot, meta.branch, existing.id, body);
        }

        return addReviewNote(
            meta.repoRoot,
            meta.branch,
            meta.baseBranch,
            meta.file,
            meta.line,
            meta.side,
            body
        );
    }

    private createThreadForNote(
        uri: Uri,
        note: ReviewNote,
        repoRoot: string,
        baseBranch: string,
        branch: string
    ): void {
        const line = Math.max(0, note.line - 1);
        const range = new Range(line, 0, line, 0);
        const thread = this.controller.createCommentThread(uri, range, []);
        this.configureThread(thread);
        this.setThreadDisplayComment(thread, note.body);
        thread.collapsibleState = CommentThreadCollapsibleState.Collapsed;
        thread.contextValue = note.published ? "published" : undefined;

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
        this.setThreadDisplayComment(thread, note.body);
        thread.contextValue = note.published ? "published" : undefined;
        thread.collapsibleState = CommentThreadCollapsibleState.Collapsed;
    }

    private resolveUriForNote(
        repoRoot: string,
        note: ReviewNote,
        refs: NoteUriRefs | undefined,
        mergeBaseSha?: string
    ): Uri | undefined {
        for (const editor of window.visibleTextEditors) {
            if (noteMatchesGitUri(note, editor.document.uri, repoRoot, mergeBaseSha)) {
                return editor.document.uri;
            }
        }

        if (note.side === "RIGHT") {
            const workingTreeUri = workingTreeUriForBranchDiffFile(repoRoot, note.file);
            if (workingTreeUri) {
                return workingTreeUri;
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

    private async ensureThreadMeta(thread: CommentThread): Promise<ThreadMeta | undefined> {
        const existing = this.threadMeta.get(thread);
        if (existing) {
            return existing;
        }

        const range = thread.range;
        if (!range) {
            return undefined;
        }

        const line = range.start.line + 1;
        const meta = await this.buildThreadMeta(thread.uri, line, true);
        if (!meta) {
            return undefined;
        }

        const adopted = await this.adoptExistingNote(thread, meta);
        if (!adopted) {
            return undefined;
        }

        this.threadMeta.set(thread, adopted);
        if (adopted.isDraft) {
            thread.contextValue = "draft";
            this.draftThreads.add(thread);
        }
        this.configureThread(thread);
        return adopted;
    }

    private async adoptExistingNote(thread: CommentThread, meta: ThreadMeta): Promise<ThreadMeta | undefined> {
        const data = await loadReviewNotes(meta.repoRoot, meta.branch);
        const existing = findNoteAtLocation(data, meta.file, meta.line, meta.side);
        if (!existing) {
            return meta;
        }

        const existingThread = this.threadByNoteId.get(existing.id);
        if (existingThread && existingThread !== thread) {
            thread.dispose();
            existingThread.collapsibleState = CommentThreadCollapsibleState.Expanded;
            return undefined;
        }

        meta.isDraft = false;
        meta.noteId = existing.id;
        this.threadByNoteId.set(existing.id, thread);
        this.setThreadDisplayComment(thread, existing.body);
        thread.contextValue = existing.published ? "published" : undefined;
        this.configureThread(thread);
        return meta;
    }

    private configureThread(thread: CommentThread): void {
        thread.canReply = false;
        thread.label = "Review note";
    }

    private isPublishedThread(thread: CommentThread): boolean {
        return thread.contextValue === "published";
    }

    private setThreadDisplayComment(thread: CommentThread, body: string): void {
        thread.comments = [this.makeComment(body, thread)];
        this.configureThread(thread);
    }

    private async buildThreadMeta(
        uri: Uri,
        line: number,
        isDraft: boolean,
        repoRootHint?: string
    ): Promise<ThreadMeta | undefined> {
        const repoRoot = repoRootHint ?? repoRootForDocumentUri(uri, this.activeRepoRoot);
        if (!repoRoot) {
            return undefined;
        }

        const repository = getRepositoryByRoot(repoRoot);
        const head = repository?.state.HEAD;
        if (!head?.name) {
            return undefined;
        }

        const file = repoRelativePath(uri, repoRoot);
        if (!file) {
            return undefined;
        }

        const baseBranch = (await resolveBaseBranch(repository!))?.name ?? "main";
        const refs = await this.resolveRefs(repoRoot);
        const mergeBaseSha = refs?.mergeBaseRef;
        const parsed = parseGitDocumentUri(uri);
        const side = parsed ? sideFromGitRef(parsed.ref, mergeBaseSha) : "RIGHT";

        return {
            repoRoot,
            branch: head.name,
            baseBranch,
            file: file.replace(/\\/g, "/"),
            line,
            side,
            isDraft,
        };
    }

    private repoRootForEditor(editor: TextEditor): string | undefined {
        return repoRootForDocumentUri(editor.document.uri, this.activeRepoRoot);
    }

    private findThreadForComment(comment: Comment): CommentThread | undefined {
        const withParent = (comment as ReviewComment).parent;
        if (withParent) {
            return withParent;
        }

        for (const thread of this.draftThreads) {
            if (thread.comments.includes(comment)) {
                (comment as ReviewComment).parent = thread;
                return thread;
            }
        }

        for (const thread of this.threadByNoteId.values()) {
            if (thread.comments.includes(comment)) {
                (comment as ReviewComment).parent = thread;
                return thread;
            }
        }

        return undefined;
    }

    private makeComment(body: string, parent: CommentThread): ReviewComment {
        const comment: ReviewComment = {
            body,
            mode: CommentMode.Preview,
            author: AUTHOR,
            contextValue: "note",
            savedBody: body,
            parent,
        };
        return comment;
    }

    private commentText(body: string | MarkdownString): string {
        return typeof body === "string" ? body.trim() : body.value.trim();
    }

    private clearThreads(): void {
        for (const thread of this.threadByNoteId.values()) {
            thread.dispose();
        }
        this.threadByNoteId.clear();
    }
}
