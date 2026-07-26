import {
    CancellationToken,
    CustomTextEditorProvider,
    ExtensionContext,
    TabInputCustom,
    TextDocument,
    Uri,
    WebviewPanel,
    window,
    workspace,
} from "vscode";
import { getNonce, getPreviewHtml } from "./getPreviewHtml";
import { handleMermaidOpenLink } from "./mermaidClickTarget";

const UPDATE_DEBOUNCE_MS = 150;

export const MERMAID_PREVIEW_VIEW_TYPE = "ib-utilities.mermaidPreview";

export class MermaidCustomEditorProvider implements CustomTextEditorProvider {
    constructor(private readonly context: ExtensionContext) {}

    async resolveCustomTextEditor(
        document: TextDocument,
        webviewPanel: WebviewPanel,
        _token: CancellationToken
    ): Promise<void> {
        const mediaRoot = Uri.joinPath(this.context.extensionUri, "media", "mermaidPreview");
        const nonce = getNonce();

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [mediaRoot],
        };
        webviewPanel.webview.html = getPreviewHtml(webviewPanel.webview, this.context, nonce);

        let updateTimer: ReturnType<typeof setTimeout> | undefined;
        let isReady = false;
        let lastSentVersion = -1;

        const postTheme = () => {
            webviewPanel.webview.postMessage({ type: "theme" });
        };

        const postUpdate = () => {
            lastSentVersion = document.version;
            webviewPanel.webview.postMessage({
                type: "update",
                source: document.getText(),
            });
        };

        const scheduleUpdate = () => {
            if (!isReady) {
                return;
            }
            if (updateTimer) {
                clearTimeout(updateTimer);
            }
            updateTimer = setTimeout(() => {
                updateTimer = undefined;
                postUpdate();
            }, UPDATE_DEBOUNCE_MS);
        };

        const disposables = [
            webviewPanel.webview.onDidReceiveMessage(async (message) => {
                if (message.type === "ready") {
                    isReady = true;
                    postTheme();
                    postUpdate();
                    return;
                }
                if (message.type === "openLink") {
                    await handleMermaidOpenLink(document.uri, {
                        href: typeof message.href === "string" ? message.href : undefined,
                        tooltip: typeof message.tooltip === "string" ? message.tooltip : undefined,
                        openBeside: message.openBeside === true,
                    });
                }
            }),
            workspace.onDidChangeTextDocument((event) => {
                if (event.document.uri.toString() !== document.uri.toString()) {
                    return;
                }
                scheduleUpdate();
            }),
            window.onDidChangeActiveColorTheme(() => {
                if (!isReady) {
                    return;
                }
                postTheme();
            }),
            webviewPanel.onDidChangeViewState((event) => {
                if (event.webviewPanel.visible && isReady && document.version !== lastSentVersion) {
                    postUpdate();
                }
            }),
            webviewPanel.onDidDispose(() => {
                if (updateTimer) {
                    clearTimeout(updateTimer);
                }
            }),
        ];

        webviewPanel.onDidDispose(() => {
            for (const disposable of disposables) {
                disposable.dispose();
            }
        });
    }
}

export function registerMermaidCustomEditor(context: ExtensionContext): void {
    context.subscriptions.push(
        window.registerCustomEditorProvider(MERMAID_PREVIEW_VIEW_TYPE, new MermaidCustomEditorProvider(context), {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    );
}
