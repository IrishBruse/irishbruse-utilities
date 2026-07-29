import { createHash } from "node:crypto";
import { ExtensionContext, TextDocument, Uri, workspace } from "vscode";
import { findMarkdownMermaidFenceAtOpenLine } from "./parseMarkdownMermaidFences";

const UPDATE_DEBOUNCE_MS = 150;

interface MarkdownMermaidPreviewBinding {
    markdownUri: Uri;
    openLine: number;
    previewUri: Uri;
}

const previewOrigins = new Map<string, Uri>();
const bindingsByPreviewKey = new Map<string, MarkdownMermaidPreviewBinding>();
let syncDisposable: { dispose(): void } | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function previewKey(previewUri: Uri): string {
    return previewUri.toString();
}

function bindingKey(markdownUri: Uri, openLine: number): string {
    return `${markdownUri.toString()}:${openLine}`;
}

function previewFileName(markdownUri: Uri, openLine: number): string {
    const hash = createHash("sha256").update(`${markdownUri.toString()}:${openLine}`).digest("hex").slice(0, 24);
    return `${hash}.mmd`;
}

export function resolveMermaidLinkBaseUri(mermaidDocumentUri: Uri): Uri {
    return previewOrigins.get(previewKey(mermaidDocumentUri)) ?? mermaidDocumentUri;
}

export async function ensureMarkdownMermaidPreviewFile(
    context: ExtensionContext,
    markdownUri: Uri,
    openLine: number,
    source: string
): Promise<Uri> {
    const previewDir = Uri.joinPath(context.globalStorageUri, "markdown-mermaid");
    await workspace.fs.createDirectory(previewDir);

    const previewUri = Uri.joinPath(previewDir, previewFileName(markdownUri, openLine));
    await workspace.fs.writeFile(previewUri, Buffer.from(source, "utf8"));

    previewOrigins.set(previewKey(previewUri), markdownUri);
    bindingsByPreviewKey.set(bindingKey(markdownUri, openLine), {
        markdownUri,
        openLine,
        previewUri,
    });

    ensureMarkdownMermaidSync(context);
    return previewUri;
}

function ensureMarkdownMermaidSync(context: ExtensionContext): void {
    if (syncDisposable) {
        return;
    }

    syncDisposable = workspace.onDidChangeTextDocument((event) => {
        const changedUri = event.document.uri.toString();
        let shouldSchedule = false;
        for (const binding of bindingsByPreviewKey.values()) {
            if (binding.markdownUri.toString() === changedUri) {
                shouldSchedule = true;
                break;
            }
        }
        if (!shouldSchedule) {
            return;
        }

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            debounceTimer = undefined;
            void syncMarkdownMermaidPreviews(event.document);
        }, UPDATE_DEBOUNCE_MS);
    });

    context.subscriptions.push(syncDisposable);
}

async function syncMarkdownMermaidPreviews(markdownDocument: TextDocument): Promise<void> {
    const markdownUri = markdownDocument.uri;
    const text = markdownDocument.getText();

    for (const binding of bindingsByPreviewKey.values()) {
        if (binding.markdownUri.toString() !== markdownUri.toString()) {
            continue;
        }

        const fence = findMarkdownMermaidFenceAtOpenLine(text, binding.openLine);
        if (!fence) {
            continue;
        }

        await workspace.fs.writeFile(binding.previewUri, Buffer.from(fence.source, "utf8"));
    }
}
