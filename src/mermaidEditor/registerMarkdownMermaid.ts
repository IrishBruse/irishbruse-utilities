import {
    CodeLens,
    CodeLensProvider,
    commands,
    DocumentLink,
    DocumentLinkProvider,
    ExtensionContext,
    languages,
    Range,
    Uri,
    ViewColumn,
    window,
    workspace,
} from "vscode";
import { Commands } from "../constants";
import { registerCommandIB } from "../utils/vscode";
import { MERMAID_PREVIEW_VIEW_TYPE } from "./MermaidCustomEditorProvider";
import { ensureMarkdownMermaidPreviewFile } from "./markdownMermaidPreview";
import { findMarkdownMermaidFenceAtOpenLine, parseMarkdownMermaidFences } from "./parseMarkdownMermaidFences";

class MarkdownMermaidCodeLensProvider implements CodeLensProvider {
    provideCodeLenses(document: { getText(): string; uri: Uri }): CodeLens[] {
        const fences = parseMarkdownMermaidFences(document.getText());
        return fences.map(
            (fence) =>
                new CodeLens(new Range(fence.openLine, 0, fence.openLine, 0), {
                    title: "Open Preview",
                    command: Commands.OpenMermaidMarkdownPreview,
                    arguments: [document.uri.toString(), fence.openLine],
                })
        );
    }
}

class MarkdownMermaidDocumentLinkProvider implements DocumentLinkProvider {
    provideDocumentLinks(document: { getText(): string; uri: Uri }): DocumentLink[] {
        const fences = parseMarkdownMermaidFences(document.getText());
        return fences.map((fence) => {
            const args = encodeURIComponent(JSON.stringify([document.uri.toString(), fence.openLine]));
            const link = new DocumentLink(
                fence.languageTagRange,
                Uri.parse(`command:${Commands.OpenMermaidMarkdownPreview}?${args}`)
            );
            link.tooltip = "Open Mermaid preview";
            return link;
        });
    }
}

async function openMermaidMarkdownPreview(markdownUriString: string, openLine: number): Promise<void> {
    const markdownUri = Uri.parse(markdownUriString);
    let document;
    try {
        document = await workspace.openTextDocument(markdownUri);
    } catch {
        void window.showErrorMessage("Could not open the markdown document for Mermaid preview.");
        return;
    }

    const fence = findMarkdownMermaidFenceAtOpenLine(document.getText(), openLine);
    if (!fence) {
        void window.showErrorMessage("Mermaid code block not found at that location.");
        return;
    }

    const context = getMarkdownMermaidContext();
    const previewUri = await ensureMarkdownMermaidPreviewFile(context, markdownUri, openLine, fence.source);

    const activeTab = window.tabGroups.activeTabGroup.activeTab;
    await commands.executeCommand("vscode.openWith", previewUri, MERMAID_PREVIEW_VIEW_TYPE, {
        viewColumn: activeTab?.group.viewColumn ?? ViewColumn.Active,
        preview: false,
    });
}

let markdownMermaidContext: ExtensionContext | undefined;

function getMarkdownMermaidContext(): ExtensionContext {
    if (!markdownMermaidContext) {
        throw new Error("Markdown Mermaid features are not activated.");
    }
    return markdownMermaidContext;
}

export function registerMarkdownMermaidFeatures(context: ExtensionContext): void {
    markdownMermaidContext = context;

    registerCommandIB(Commands.OpenMermaidMarkdownPreview, openMermaidMarkdownPreview, context);

    context.subscriptions.push(
        languages.registerCodeLensProvider(
            { language: "markdown" },
            new MarkdownMermaidCodeLensProvider()
        ),
        languages.registerDocumentLinkProvider(
            { language: "markdown" },
            new MarkdownMermaidDocumentLinkProvider()
        )
    );
}
