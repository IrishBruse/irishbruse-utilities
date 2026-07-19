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
import { actionPanelTemplates } from "./actionTemplates";
import { buildActionFromForm, type ActionPanelFormValues } from "./buildActionFromForm";
import { getConfiguredActionPanelActions } from "./getActionPanelActions";
import type { ActionPanelAction } from "./types";

export type ActionPanelEditorRequest = {
    templateId?: string;
    action?: ActionPanelAction;
};

type EditorMessage =
    | { type: "ready" }
    | { type: "save"; values: ActionPanelFormValues; templateId?: string }
    | { type: "cancel" };

export class ActionPanelActionEditor implements Disposable {
    private panel: WebviewPanel | undefined;
    private pending: ((value: ActionPanelAction | undefined) => void) | undefined;
    private htmlTemplate: string | undefined;
    private codicons: string[] | undefined;
    private currentRequest: ActionPanelEditorRequest = {};
    private editingActionId: string | undefined;

    constructor(private readonly context: ExtensionContext) {}

    dispose(): void {
        this.panel?.dispose();
        this.panel = undefined;
        this.pending = undefined;
    }

    open(request: ActionPanelEditorRequest = {}): Promise<ActionPanelAction | undefined> {
        this.currentRequest = request;
        this.editingActionId = request.action?.id;

        if (this.panel && this.pending) {
            this.panel.title = request.action ? "Edit Action" : "Add Action";
            this.panel.reveal(ViewColumn.Active, true);
            void this.postInit(request);
            return new Promise((resolve) => {
                const previous = this.pending!;
                this.pending = (value) => {
                    previous(undefined);
                    resolve(value);
                };
            });
        }

        return new Promise((resolve) => {
            this.pending = resolve;
            const panel = window.createWebviewPanel(
                "ib-utilities.actionPanelEditor",
                request.action ? "Edit Action" : "Add Action",
                { viewColumn: ViewColumn.Active, preserveFocus: false },
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [Uri.joinPath(this.context.extensionUri, "media", "actionPanelEditor")],
                }
            );
            this.panel = panel;

            panel.onDidDispose(() => {
                this.finish(undefined);
            });

            panel.webview.onDidReceiveMessage((message: EditorMessage) => {
                if (message.type === "ready") {
                    void this.postInit(request);
                    return;
                }
                if (message.type === "save") {
                    this.handleSave(message);
                    return;
                }
                if (message.type === "cancel") {
                    this.finish(undefined);
                }
            });

            void this.render(panel);
        });
    }

    private async render(panel: WebviewPanel): Promise<void> {
        const mediaDir = Uri.joinPath(this.context.extensionUri, "media", "actionPanelEditor");
        const nonce = String(Date.now());
        const scriptUri = panel.webview.asWebviewUri(Uri.joinPath(mediaDir, "editor.js"));
        const codiconCssUri = panel.webview.asWebviewUri(Uri.joinPath(mediaDir, "codicon.css"));

        if (!this.htmlTemplate) {
            this.htmlTemplate = await readFile(
                path.join(this.context.extensionUri.fsPath, "media", "actionPanelEditor", "editor.html"),
                "utf8"
            );
        }

        panel.webview.html = this.htmlTemplate
            .replaceAll("__NONCE__", nonce)
            .replaceAll("__SCRIPT_URI__", scriptUri.toString())
            .replaceAll("__CODICON_CSS_URI__", codiconCssUri.toString())
            .replaceAll("__CSP_SOURCE__", panel.webview.cspSource);
    }

    private async getCodicons(): Promise<string[]> {
        if (!this.codicons) {
            const raw = await readFile(
                path.join(this.context.extensionUri.fsPath, "media", "actionPanelEditor", "codicons.json"),
                "utf8"
            );
            this.codicons = JSON.parse(raw) as string[];
        }
        return this.codicons;
    }

    private getInitialValues(request: ActionPanelEditorRequest): ActionPanelFormValues & { templateId: string } {
        if (request.action) {
            return {
                templateId: "custom",
                label: request.action.label,
                type: request.action.type,
                icon: request.action.icon ?? "",
                prompt: request.action.prompt ?? "",
                command: request.action.command ?? "",
            };
        }

        const template =
            actionPanelTemplates.find((entry) => entry.id === request.templateId) ??
            actionPanelTemplates.find((entry) => entry.id === "custom")!;
        const draft = template.draft;

        return {
            templateId: template.id,
            label: draft.label ?? "",
            type: draft.type ?? "agent",
            icon: draft.icon ?? "",
            prompt: draft.prompt ?? "",
            command: draft.command ?? "",
        };
    }

    private async postInit(request: ActionPanelEditorRequest): Promise<void> {
        if (!this.panel) {
            return;
        }

        await this.panel.webview.postMessage({
            type: "init",
            mode: request.action ? "edit" : "add",
            templates: actionPanelTemplates.map((template) => ({
                id: template.id,
                label: template.label,
                description: template.description,
                draft: template.draft,
            })),
            codicons: await this.getCodicons(),
            values: this.getInitialValues(request),
        });
    }

    private handleSave(message: Extract<EditorMessage, { type: "save" }>): void {
        const existingIds = new Set(
            getConfiguredActionPanelActions()
                .filter((action) => action.id !== this.editingActionId)
                .map((action) => action.id)
        );
        const preferredId =
            this.editingActionId ??
            (message.templateId && message.templateId !== "custom" ? message.templateId : undefined);
        const result = buildActionFromForm(message.values, existingIds, preferredId);
        if (!result.ok) {
            void this.panel?.webview.postMessage({
                type: "error",
                message: result.error,
                field: result.field,
            });
            return;
        }

        this.finish(result.action);
    }

    private finish(result: ActionPanelAction | undefined): void {
        const pending = this.pending;
        this.pending = undefined;
        this.editingActionId = undefined;
        if (this.panel) {
            const panel = this.panel;
            this.panel = undefined;
            panel.dispose();
        }
        pending?.(result);
    }
}
