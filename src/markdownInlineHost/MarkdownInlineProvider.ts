import {
    CancellationToken,
    CustomTextEditorProvider,
    ExtensionContext,
    Range,
    Selection,
    TextDocument,
    Uri,
    Webview,
    WebviewPanel,
    WorkspaceEdit,
    commands,
    env,
    window,
    workspace,
} from "vscode";
import { Commands } from "../constants";
import {
    getMarkdownInlineEditorColors,
    markdownInlineEditorColorsCssVars,
} from "./markdownInlineEditorColors";
import { openMarkdownWithRawEditor, shouldUseMarkdownCustomEditor } from "./shouldUseMarkdownCustomEditor";
import { isSkillMarkdownPath, prefixMarkdownForFastOpen } from "./webviewInitialState";

export const MARKDOWN_INLINE_VIEW_TYPE = "ib-utilities.markdownInline";

function getNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function clampOffset(offset: number, length: number): number {
    const whole = Math.trunc(offset);
    if (whole < 0) {
        return 0;
    }
    if (whole > length) {
        return length;
    }
    return whole;
}

class AuthenticatedWebview {
    readonly #messageSecret = crypto.randomUUID();

    constructor(readonly webview: Webview) {}

    get messageSecret(): string {
        return this.#messageSecret;
    }

    postMessage(message: object): Thenable<boolean> {
        return this.webview.postMessage({ ...message, messageSecret: this.#messageSecret });
    }
}

function getEditorHtml(
    documentUri: Uri,
    webview: Webview,
    extensionUri: Uri,
    messageSecret: string,
    content: string,
    documentVersion: number,
): string {
    const mediaRoot = Uri.joinPath(extensionUri, "media", "markdownInline");
    const scriptUri = webview.asWebviewUri(Uri.joinPath(mediaRoot, "editor.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(mediaRoot, "editor.css"));
    const workerUri = webview.asWebviewUri(Uri.joinPath(mediaRoot, "editor.worker.js"));
    const baseUri = webview.asWebviewUri(documentUri);
    const nonce = getNonce();
    const initialState = encodeURIComponent(JSON.stringify({
        content,
        documentVersion,
        readonly: false,
        documentUrl: baseUri.toString(),
        skillFrontMatter: isSkillMarkdownPath(documentUri.path),
    }));
    const colorVars = markdownInlineEditorColorsCssVars(getMarkdownInlineEditorColors());

    return  `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}'; worker-src ${webview.cspSource};" />
    <meta name="inline-md-message-secret" content="${messageSecret}" />
    <meta name="inline-md-worker" content="${workerUri.toString().replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" />
    <meta id="inline-md-state" content="${initialState}" />
    <base href="${baseUri}" />
    <link rel="stylesheet" href="${styleUri}" />
    <style>
        :root {
            ${colorVars}
        }
    </style>
    <title>Inline Markdown (ib-utilities)</title>
</head>
<body>
    <div id="editor"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}

async function openMarkdownLink(href: string, documentUri: Uri): Promise<void> {
    if (/^https?:\/\//i.test(href)) {
        await env.openExternal(Uri.parse(href));
        return;
    }

    const hashIndex = href.indexOf("#");
    const pathPart = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
    const fragment = hashIndex >= 0 ? href.slice(hashIndex + 1) : undefined;
    const baseDir = Uri.joinPath(documentUri, "..");
    const targetPath = pathPart.length > 0 ? pathPart : documentUri.path.split("/").pop() ?? "";
    const target = Uri.joinPath(baseDir, ...targetPath.split("/").filter(Boolean));

    if (fragment) {
        const lineMatch = /^L(\d+)(?:,(\d+))?$/.exec(fragment);
        if (lineMatch) {
            const line = Math.max(0, Number(lineMatch[1]) - 1);
            const column = lineMatch[2] !== undefined ? Math.max(0, Number(lineMatch[2]) - 1) : 0;
            const doc = await workspace.openTextDocument(target);
            const editor = await window.showTextDocument(doc);
            const safeLine = Math.min(line, doc.lineCount - 1);
            const position = doc.lineAt(safeLine).range.start.with(undefined, column);
            editor.selection = new Selection(position, position);
            editor.revealRange(new Range(position, position));
            return;
        }
    }

    await commands.executeCommand("vscode.open", target);
}

export class MarkdownInlineProvider implements CustomTextEditorProvider {
    constructor(private readonly context: ExtensionContext) {}

    async resolveCustomTextEditor(
        document: TextDocument,
        webviewPanel: WebviewPanel,
        _token: CancellationToken,
    ): Promise<void> {
        let released = false;
        const releaseIfNotEditor = async () => {
            if (released || shouldUseMarkdownCustomEditor(document.uri)) {
                return false;
            }
            released = true;
            await openMarkdownWithRawEditor(document.uri, webviewPanel.viewColumn);
            webviewPanel.dispose();
            return true;
        };
        if (await releaseIfNotEditor()) {
            return;
        }

        const mediaRoot = Uri.joinPath(this.context.extensionUri, "media", "markdownInline");
        const editorWebview = new AuthenticatedWebview(webviewPanel.webview);

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                mediaRoot,
                Uri.joinPath(document.uri, ".."),
                ...(workspace.getWorkspaceFolder(document.uri)
                    ? [workspace.getWorkspaceFolder(document.uri)!.uri]
                    : []),
            ],
        };

        let isUpdatingFromWebview = false;
        let editQueue = Promise.resolve();
        let webviewReady = false;
        let htmlContentIsPrefix = false;

        const renderHtml = () => {
            webviewReady = false;
            const text = document.getText();
            const prefix = prefixMarkdownForFastOpen(text);
            htmlContentIsPrefix = prefix.length < text.length;
            webviewPanel.webview.html = getEditorHtml(
                document.uri,
                webviewPanel.webview,
                this.context.extensionUri,
                editorWebview.messageSecret,
                prefix,
                document.version,
            );
        };

        renderHtml();

        const releaseTimers = [0, 50].map((delay) => setTimeout(() => {
            void releaseIfNotEditor();
        }, delay));
        const disposables = [
            { dispose: () => {
                for (const timer of releaseTimers) {
                    clearTimeout(timer);
                }
            } },
            editorWebview.webview.onDidReceiveMessage(async (message) => {
                if (!message || typeof message !== "object" || message.messageSecret !== editorWebview.messageSecret) {
                    return;
                }

                switch (message.type) {
                    case "ready": {
                        webviewReady = true;
                        if (htmlContentIsPrefix || message.documentVersion !== document.version) {
                            await editorWebview.postMessage({ type: "update", content: document.getText() });
                        }
                        break;
                    }
                    case "history": {
                        if (message.command === "undo" || message.command === "redo") {
                            await editQueue;
                            if (webviewPanel.active) {
                                await commands.executeCommand(message.command);
                            }
                        }
                        break;
                    }
                    case "openLink": {
                        if (typeof message.href === "string") {
                            await openMarkdownLink(message.href, document.uri);
                        }
                        break;
                    }
                    case "openMermaidPreview": {
                        if (typeof message.openLine !== "number" || !Number.isFinite(message.openLine)) {
                            break;
                        }
                        await commands.executeCommand(
                            Commands.OpenMermaidMarkdownPreview,
                            document.uri.toString(),
                            message.openLine,
                        );
                        break;
                    }
                    case "edit": {
                        const startOffset = message.start;
                        const endOffset = message.endExclusive;
                        const text = message.text;
                        if (
                            typeof startOffset !== "number"
                            || !Number.isFinite(startOffset)
                            || typeof endOffset !== "number"
                            || !Number.isFinite(endOffset)
                            || typeof text !== "string"
                        ) {
                            break;
                        }
                        editQueue = editQueue.then(async () => {
                            const length = document.getText().length;
                            const start = clampOffset(startOffset, length);
                            const endExclusive = clampOffset(endOffset, length);
                            const edit = new WorkspaceEdit();
                            edit.replace(
                                document.uri,
                                new Range(
                                    document.positionAt(Math.min(start, endExclusive)),
                                    document.positionAt(Math.max(start, endExclusive)),
                                ),
                                text,
                            );
                            isUpdatingFromWebview = true;
                            try {
                                await workspace.applyEdit(edit);
                            } finally {
                                isUpdatingFromWebview = false;
                            }
                        });
                        await editQueue;
                        break;
                    }
                }
            }),
            workspace.onDidChangeTextDocument((event) => {
                if (event.document.uri.toString() !== document.uri.toString() || isUpdatingFromWebview) {
                    return;
                }
                if (webviewReady) {
                    void editorWebview.postMessage({ type: "update", content: document.getText() });
                }
            }),
            webviewPanel.onDidDispose(() => {
                for (const disposable of disposables) {
                    disposable.dispose();
                }
            }),
        ];
    }
}

export function registerMarkdownInlineEditor(context: ExtensionContext): void {
    context.subscriptions.push(
        window.registerCustomEditorProvider(MARKDOWN_INLINE_VIEW_TYPE, new MarkdownInlineProvider(context), {
            webviewOptions: { retainContextWhenHidden: true },
        }),
    );
}
