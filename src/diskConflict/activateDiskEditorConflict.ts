import {
    commands,
    ExtensionContext,
    FileSystemWatcher,
    TextDocument,
    Uri,
    window,
    workspace,
} from "vscode";
import { Commands } from "../constants";
import { registerCommandIB } from "../utils/vscode";
import { getActiveFileUri } from "./getActiveFileUri";
import { hasDiskEditorConflict } from "./hasDiskEditorConflict";

export const DISK_EDITOR_CONFLICT_CONTEXT = "ib-utilities.diskEditorConflict";

const baselineByUri = new Map<string, string>();
const currentDiskByUri = new Map<string, string>();
const watchers = new Map<string, FileSystemWatcher>();

function uriKey(uri: Uri): string {
    return uri.toString();
}

function isFileDocument(document: TextDocument): boolean {
    return document.uri.scheme === "file";
}

function findDocument(uri: Uri): TextDocument | undefined {
    const key = uriKey(uri);
    return workspace.textDocuments.find((document) => uriKey(document.uri) === key);
}

function setBaselineFromDocument(document: TextDocument): void {
    if (!isFileDocument(document) || document.isDirty) {
        return;
    }

    const text = document.getText();
    const key = uriKey(document.uri);
    baselineByUri.set(key, text);
    currentDiskByUri.set(key, text);
}

async function readDiskText(uri: Uri): Promise<string | undefined> {
    try {
        const bytes = await workspace.fs.readFile(uri);
        return new TextDecoder().decode(bytes);
    } catch {
        return undefined;
    }
}

async function refreshConflictContext(): Promise<void> {
    const uri = getActiveFileUri();
    if (!uri) {
        await commands.executeCommand("setContext", DISK_EDITOR_CONFLICT_CONTEXT, false);
        return;
    }

    const document = findDocument(uri);
    const key = uriKey(uri);
    const baseline = baselineByUri.get(key);
    const disk = currentDiskByUri.get(key);
    const conflict =
        document !== undefined &&
        baseline !== undefined &&
        disk !== undefined &&
        hasDiskEditorConflict(document.getText(), baseline, disk);

    await commands.executeCommand("setContext", DISK_EDITOR_CONFLICT_CONTEXT, conflict);
}

async function onDiskChange(uri: Uri): Promise<void> {
    const disk = await readDiskText(uri);
    const key = uriKey(uri);
    if (disk === undefined) {
        currentDiskByUri.delete(key);
    } else {
        currentDiskByUri.set(key, disk);
    }
    await refreshConflictContext();
}

function ensureWatcher(uri: Uri, context: ExtensionContext): void {
    const key = uriKey(uri);
    if (watchers.has(key)) {
        return;
    }

    const watcher = workspace.createFileSystemWatcher(uri.fsPath);
    watcher.onDidChange((changed) => {
        void onDiskChange(changed);
    });
    watcher.onDidCreate((changed) => {
        void onDiskChange(changed);
    });
    watcher.onDidDelete((changed) => {
        currentDiskByUri.delete(uriKey(changed));
        void refreshConflictContext();
    });
    watchers.set(key, watcher);
    context.subscriptions.push(watcher);
}

function trackDocument(document: TextDocument, context: ExtensionContext): void {
    if (!isFileDocument(document)) {
        return;
    }

    ensureWatcher(document.uri, context);
    setBaselineFromDocument(document);
}

function forgetDocument(document: TextDocument): void {
    const key = uriKey(document.uri);
    const stillOpen = workspace.textDocuments.some((open) => uriKey(open.uri) === key);
    if (stillOpen) {
        return;
    }

    watchers.get(key)?.dispose();
    watchers.delete(key);
    baselineByUri.delete(key);
    currentDiskByUri.delete(key);
}

export async function revertToDisk(): Promise<void> {
    const uri = getActiveFileUri();
    if (!uri) {
        return;
    }

    await commands.executeCommand("workbench.action.files.revert");

    const document = findDocument(uri);
    if (document && !document.isDirty) {
        setBaselineFromDocument(document);
    } else {
        const disk = await readDiskText(uri);
        if (disk !== undefined) {
            const key = uriKey(uri);
            baselineByUri.set(key, disk);
            currentDiskByUri.set(key, disk);
        }
    }

    await refreshConflictContext();
}

export function activateDiskEditorConflict(context: ExtensionContext): void {
    for (const document of workspace.textDocuments) {
        trackDocument(document, context);
    }

    context.subscriptions.push(
        workspace.onDidOpenTextDocument((document) => {
            trackDocument(document, context);
            void refreshConflictContext();
        }),
        workspace.onDidCloseTextDocument((document) => {
            forgetDocument(document);
            void refreshConflictContext();
        }),
        workspace.onDidSaveTextDocument((document) => {
            setBaselineFromDocument(document);
            void refreshConflictContext();
        }),
        workspace.onDidChangeTextDocument((event) => {
            setBaselineFromDocument(event.document);
            void refreshConflictContext();
        }),
        window.onDidChangeActiveTextEditor(() => {
            void refreshConflictContext();
        }),
        window.tabGroups.onDidChangeTabs(() => {
            void refreshConflictContext();
        }),
    );

    registerCommandIB(Commands.RevertToDisk, revertToDisk, context);
    void refreshConflictContext();
}
