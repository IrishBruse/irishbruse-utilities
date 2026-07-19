import { readFile } from "fs/promises";
import path from "path";
import {
    Disposable,
    Uri,
    ViewColumn,
    WebviewPanel,
    window,
    type ExtensionContext,
} from "vscode";

export type ReviewNoteEditorRequest = {
    location: string;
    body: string;
    readOnly?: boolean;
};

export type ReviewNoteEditorResult = string | undefined;

export class ReviewNoteEditor implements Disposable {
    private panel: WebviewPanel | undefined;
    private pending:
        | {
              request: ReviewNoteEditorRequest;
              resolve: (value: ReviewNoteEditorResult) => void;
          }
        | undefined;
    private htmlTemplate: string | undefined;

    constructor(private readonly context: ExtensionContext) {}

    dispose(): void {
        this.panel?.dispose();
        this.panel = undefined;
        this.pending = undefined;
    }

    async open(request: ReviewNoteEditorRequest): Promise<ReviewNoteEditorResult> {
        if (this.panel && this.pending) {
            this.pending.request = request;
            this.panel.reveal(ViewColumn.Beside, true);
            await this.postInit(request);
            return new Promise((resolve) => {
                const previous = this.pending!.resolve;
                this.pending = {
                    request,
                    resolve: (value) => {
                        previous(undefined);
                        resolve(value);
                    },
                };
            });
        }

        return new Promise((resolve) => {
            this.pending = { request, resolve };
            this.panel = window.createWebviewPanel(
                "ib-utilities.reviewNoteEditor",
                "Review note",
                { viewColumn: ViewColumn.Beside, preserveFocus: false },
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [Uri.joinPath(this.context.extensionUri, "media", "reviewNoteEditor")],
                }
            );

            this.panel.onDidDispose(() => {
                this.finish(undefined);
            });

            void this.render(this.panel, request);
        });
    }

    private async render(panel: WebviewPanel, request: ReviewNoteEditorRequest): Promise<void> {
        const mediaDir = Uri.joinPath(this.context.extensionUri, "media", "reviewNoteEditor");
        const nonce = String(Date.now());
        const scriptUri = panel.webview.asWebviewUri(Uri.joinPath(mediaDir, "editor.js"));

        if (!this.htmlTemplate) {
            this.htmlTemplate = await readFile(
                path.join(this.context.extensionUri.fsPath, "media", "reviewNoteEditor", "editor.html"),
                "utf8"
            );
        }

        panel.webview.html = this.htmlTemplate
            .replaceAll("__NONCE__", nonce)
            .replaceAll("__SCRIPT_URI__", scriptUri.toString());

        panel.webview.onDidReceiveMessage((message: { type?: string; body?: string }) => {
            if (message.type === "ready") {
                void this.postInit(request);
                return;
            }
            if (message.type === "save") {
                this.finish(typeof message.body === "string" ? message.body : "");
                return;
            }
            if (message.type === "cancel") {
                this.finish(undefined);
            }
        });
    }

    private async postInit(request: ReviewNoteEditorRequest): Promise<void> {
        if (!this.panel) {
            return;
        }
        await this.panel.webview.postMessage({
            type: "init",
            location: request.location,
            body: request.body,
            readOnly: request.readOnly ?? false,
        });
    }

    private finish(result: ReviewNoteEditorResult): void {
        const pending = this.pending;
        this.pending = undefined;
        if (this.panel) {
            const panel = this.panel;
            this.panel = undefined;
            panel.dispose();
        }
        pending?.resolve(result);
    }
}
