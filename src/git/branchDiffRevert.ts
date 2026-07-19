import path from "path";
import {
    commands,
    ExtensionContext,
    Range,
    Selection,
    TextDocument,
    TextEditor,
    window,
    workspace,
} from "vscode";
import { Commands } from "../constants";
import { registerCommandIB } from "../utils/vscode";
import { asyncSpawn } from "../utils/asyncSpawn";
import {
    getBranchDiffSession,
    hasOpenBranchDiffEditor,
    isBranchDiffWorkingTreeFile,
} from "./branchDiffFiles";
import { replacementTextForModifiedLineRange } from "./branchDiffLineDiff";
import { findBaseGitEditor } from "./branchDiffEditors";

const BRANCH_DIFF_FILE_CONTEXT = "ib-utilities.inBranchDiffFile";
const pendingAutoSaves = new Map<string, ReturnType<typeof setTimeout>>();

export function activateBranchDiffRevert(context: ExtensionContext): void {
    context.subscriptions.push(
        window.onDidChangeActiveTextEditor((editor) => {
            void updateBranchDiffFileContext(editor);
        })
    );
    context.subscriptions.push(
        workspace.onDidChangeTextDocument((event) => {
            scheduleAutoSave(event.document);
        })
    );

    registerCommandIB(Commands.RevertBranchDiffHunk, () => revertBranchDiffHunk(), context);
    registerCommandIB(Commands.RevertBranchDiffSelection, () => revertBranchDiffSelection(), context);

    void updateBranchDiffFileContext(window.activeTextEditor);
}

async function updateBranchDiffFileContext(editor: TextEditor | undefined): Promise<void> {
    const inBranchDiffFile = editor ? isBranchDiffWorkingTreeFile(editor.document.uri) : false;
    await commands.executeCommand("setContext", BRANCH_DIFF_FILE_CONTEXT, inBranchDiffFile);
}

function scheduleAutoSave(document: TextDocument): void {
    if (!isBranchDiffWorkingTreeFile(document.uri) || !hasOpenBranchDiffEditor()) {
        return;
    }

    const key = document.uri.toString();
    const pending = pendingAutoSaves.get(key);
    if (pending) {
        clearTimeout(pending);
    }

    pendingAutoSaves.set(
        key,
        setTimeout(() => {
            pendingAutoSaves.delete(key);
            void saveIfDirty(document);
        }, 75)
    );
}

async function saveIfDirty(document: TextDocument): Promise<void> {
    if (document.isDirty) {
        await document.save();
    }
}

function activeBranchDiffEditor(): TextEditor | undefined {
    const editor = window.activeTextEditor;
    if (!editor || !isBranchDiffWorkingTreeFile(editor.document.uri)) {
        return undefined;
    }
    return editor;
}

export async function revertBranchDiffHunk(): Promise<void> {
    const editor = activeBranchDiffEditor();
    if (!editor) {
        window.showWarningMessage("Open a changed file in Diff vs base to revert.");
        return;
    }

    const beforeVersion = editor.document.version;
    await commands.executeCommand("diffEditor.revert");

    if (editor.document.version === beforeVersion) {
        window.showInformationMessage("Place the cursor in a change hunk to revert.");
        return;
    }

    await saveIfDirty(editor.document);
}

export async function revertBranchDiffSelection(): Promise<void> {
    const editor = activeBranchDiffEditor();
    if (!editor) {
        window.showWarningMessage("Open a changed file in Diff vs base to revert.");
        return;
    }

    if (editor.selection.isEmpty) {
        window.showInformationMessage("Select the lines you want to revert to the base branch.");
        return;
    }

    const session = getBranchDiffSession();
    if (!session) {
        window.showWarningMessage("Open Diff vs base to revert changes.");
        return;
    }

    const range = fullLineRange(editor.document, editor.selection);
    const baseText = await readBaseFileText(session.repoRoot, session.mergeBaseRef, editor.document.uri.fsPath);
    const modifiedText = editor.document.getText();
    const eol = editor.document.eol === 1 ? "\r\n" : "\n";
    const baseLines = splitLines(baseText);
    const modLines = splitLines(modifiedText);
    const replacement = replacementTextForModifiedLineRange(
        baseLines,
        modLines,
        range.start.line,
        range.end.line,
        eol
    );

    const applied = await editor.edit((editBuilder) => {
        editBuilder.replace(range, replacement);
    });
    if (!applied) {
        window.showWarningMessage("Could not revert the selected lines.");
        return;
    }

    await saveIfDirty(editor.document);
}

function fullLineRange(document: TextDocument, selection: Selection): Range {
    const endLine = selection.end.character === 0 ? selection.end.line - 1 : selection.end.line;
    const safeEndLine = Math.max(selection.start.line, endLine);
    return new Range(
        selection.start.line,
        0,
        safeEndLine,
        document.lineAt(safeEndLine).text.length
    );
}

function splitLines(text: string): string[] {
    if (text.length === 0) {
        return [];
    }
    return text.split(/\r?\n/);
}

async function readBaseFileText(repoRoot: string, mergeBaseRef: string, filePath: string): Promise<string> {
    const baseEditor = findBaseGitEditor(filePath, mergeBaseRef);
    if (baseEditor) {
        return baseEditor.document.getText();
    }

    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    const result = await asyncSpawn("git", ["show", `${mergeBaseRef}:${relativePath}`], { cwd: repoRoot });
    if (result.status !== 0) {
        throw new Error(result.stderr.trim() || `Could not read ${relativePath} at ${mergeBaseRef}.`);
    }
    return result.stdout;
}
