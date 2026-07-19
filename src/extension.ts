import { ExtensionContext, Uri, window } from "vscode";
import { activateBranchDiffRevert } from "./git/branchDiffRevert";
import { syncBranchDiffWorkingTreeFiles } from "./git/branchDiffFiles";
import { openMermaidPreview } from "./commands/openMermaidPreview";
import { openMermaidSource } from "./commands/openMermaidSource";
import { relativeGoTo } from "./commands/relativeGoTo";
import { terminalPaste } from "./commands/terminalPaste";
import { activateReviewCommentController } from "./git/reviewCommentController";
import { exportReviewSummary, promptAndAddReviewNote } from "./git/publishReview";
import { getActiveRepository } from "./git/resolveActiveRepository";
import { ActionPanelViewProvider } from "./actionPanel/ActionPanelView";
import { GitHelpersViewProvider } from "./gitHelpers/GitHelpersView";
import { registerMermaidCustomEditor } from "./mermaidEditor/MermaidCustomEditorProvider";
import { SnippetViewProvider } from "./snippetEditor/SnippetView";
import { registerCommandIB } from "./utils/vscode";
import { Commands } from "./constants";

export let UserPath: string = null!;
export let SnippetsPath: string = null!;

export function activate(context: ExtensionContext) {
    const userFolderUri = Uri.joinPath(context.globalStorageUri, "../..");
    UserPath = userFolderUri.fsPath;

    const snippetsFolderUri = Uri.joinPath(userFolderUri, "snippets");
    SnippetsPath = snippetsFolderUri.fsPath;

    registerCommandIB(Commands.RelativeGoTo, relativeGoTo, context);
    registerCommandIB(Commands.TerminalPaste, terminalPaste, context);
    registerCommandIB(Commands.OpenMermaidPreview, openMermaidPreview, context);
    registerCommandIB(Commands.OpenMermaidSource, openMermaidSource, context);

    registerMermaidCustomEditor(context);
    SnippetViewProvider.activate(context);
    activateReviewCommentController(context);
    activateBranchDiffRevert(context);
    context.subscriptions.push(window.tabGroups.onDidChangeTabs(() => syncBranchDiffWorkingTreeFiles()));
    ActionPanelViewProvider.activate(context);
    GitHelpersViewProvider.activate(context);

    registerCommandIB(Commands.AddReviewNote, async () => {
        const repo = await getActiveRepository();
        if (repo) {
            await promptAndAddReviewNote(repo.rootUri.fsPath);
        }
    }, context);
    registerCommandIB(Commands.ExportReviewSummary, async () => {
        const repo = await getActiveRepository();
        const branch = repo?.state.HEAD?.name;
        if (repo && branch) {
            await exportReviewSummary(repo.rootUri.fsPath, branch);
        }
    }, context);
}

export function deactivate() {
    SnippetViewProvider.deactivate();
}
