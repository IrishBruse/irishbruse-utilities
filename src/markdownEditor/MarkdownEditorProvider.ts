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
import {
    configureMarkdownSyntaxHighlighting,
    highlightMarkdownCode,
    invalidateMarkdownSyntaxTheme,
    unstyledHighlight,
} from "./syntaxHighlighting";
import { encodeWebviewInitialState } from "./webviewInitialState";

export const MARKDOWN_EDITOR_VIEW_TYPE = "ib-utilities.markdownEditor";

const READONLY_STATE_KEY = "ib-utilities.markdownEditor.readonly";

function getNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
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

function getMarkdownInlineEditorTables(): { maxColumnWidth: number; style: 'wrapped' | 'compact' } {
    const config = workspace.getConfiguration("markdownInlineEditor");
    const style = config.get<string>("tables.style", "wrapped");
    return {
        maxColumnWidth: config.get<number>("tables.maxColumnWidth", 160),
        style: style === "compact" ? "compact" : "wrapped",
    };
}

function getEditorHtml(
    documentUri: Uri,
    webview: Webview,
    extensionUri: Uri,
    messageSecret: string,
    globalReadonly: boolean,
    content: string,
    documentVersion: number,
): string {
    const mediaRoot = Uri.joinPath(extensionUri, "media", "markdownEditor");
    const scriptUri = webview.asWebviewUri(Uri.joinPath(mediaRoot, "editor.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(mediaRoot, "editor.css"));
    const baseUri = webview.asWebviewUri(documentUri);
    const nonce = getNonce();
    const initialState = encodeWebviewInitialState({
        content,
        documentVersion,
        readonly: globalReadonly,
        richLinksEnabled: false,
        linkPresentationRules: [],
        tables: getMarkdownInlineEditorTables(),
    });
    const colorVars = markdownInlineEditorColorsCssVars(getMarkdownInlineEditorColors());

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; media-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}'; frame-src 'self';" />
    <meta name="vscode-markdown-editor-script-nonce" content="${nonce}" />
    <meta name="vscode-markdown-editor-message-secret" content="${messageSecret}" />
    <meta id="vscode-markdown-editor-initial-state" content="${initialState}" />
    <base href="${baseUri}" />
    <link rel="stylesheet" href="${styleUri}" />
    <style>
        :root {
            ${colorVars}
        }
    </style>
    <title>Markdown Editor (ib-utilities)</title>
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

export class MarkdownEditorProvider implements CustomTextEditorProvider {
    constructor(private readonly context: ExtensionContext) {}

    async resolveCustomTextEditor(
        document: TextDocument,
        webviewPanel: WebviewPanel,
        _token: CancellationToken,
    ): Promise<void> {
        const mediaRoot = Uri.joinPath(this.context.extensionUri, "media", "markdownEditor");
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

        const renderHtml = () => {
            webviewReady = false;
            webviewPanel.webview.html = getEditorHtml(
                document.uri,
                webviewPanel.webview,
                this.context.extensionUri,
                editorWebview.messageSecret,
                this.context.globalState.get(READONLY_STATE_KEY, false),
                document.getText(),
                document.version,
            );
        };

        renderHtml();

        const disposables = [
            editorWebview.webview.onDidReceiveMessage(async (message) => {
                if (!message || typeof message !== "object" || message.messageSecret !== editorWebview.messageSecret) {
                    return;
                }

                switch (message.type) {
                    case "ready": {
                        webviewReady = true;
                        if (message.documentVersion !== document.version) {
                            await editorWebview.postMessage({ type: "update", content: document.getText() });
                        }
                        await editorWebview.postMessage({ type: "codeBlockEditorProviders", codeBlockEditorProviders: [] });
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
                        if (typeof message.offset !== "number" || !Number.isFinite(message.offset)) {
                            break;
                        }
                        const openLine = document.positionAt(Math.max(0, message.offset)).line;
                        await commands.executeCommand(
                            Commands.OpenMermaidMarkdownPreview,
                            document.uri.toString(),
                            openLine,
                        );
                        break;
                    }
                    case "setReadonly": {
                        await this.context.globalState.update(READONLY_STATE_KEY, !!message.readonly);
                        break;
                    }
                    case "edit": {
                        editQueue = editQueue.then(async () => {
                            const edit = new WorkspaceEdit();
                            edit.replace(
                                document.uri,
                                new Range(document.positionAt(message.start), document.positionAt(message.endExclusive)),
                                message.text,
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
                    case "highlight": {
                        if (
                            typeof message.requestId !== "number"
                            || typeof message.source !== "string"
                            || typeof message.languageId !== "string"
                        ) {
                            break;
                        }
                        let result;
                        try {
                            result = await highlightMarkdownCode(message.source, message.languageId);
                        } catch {
                            result = unstyledHighlight(message.source);
                        }
                        await editorWebview.postMessage({
                            type: "highlightResult",
                            requestId: message.requestId,
                            tokens: result.tokens,
                            colorMap: result.colorMap,
                        });
                        break;
                    }
                    case "codeBlockEditorDiagnostic":
                        break;
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
            workspace.onDidChangeConfiguration((event) => {
                if (
                    event.affectsConfiguration("markdownInlineEditor.colors")
                    || event.affectsConfiguration("markdownInlineEditor.tables")
                ) {
                    renderHtml();
                }
            }),
            window.onDidChangeActiveColorTheme(() => {
                invalidateMarkdownSyntaxTheme();
                if (webviewReady) {
                    void editorWebview.postMessage({ type: "highlightThemeChanged" });
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

export function registerMarkdownEditor(context: ExtensionContext): void {
    configureMarkdownSyntaxHighlighting(context.extensionPath);
    context.subscriptions.push(
        window.registerCustomEditorProvider(MARKDOWN_EDITOR_VIEW_TYPE, new MarkdownEditorProvider(context), {
            webviewOptions: { retainContextWhenHidden: true },
        }),
    );
}
