import { ExtensionContext, Uri, window } from "vscode";
import { activateDiskEditorConflict } from "./diskConflict/activateDiskEditorConflict";
import { activateBranchDiffRevert } from "./lib/git/branchDiffRevert";
import { syncBranchDiffWorkingTreeFiles } from "./lib/git/branchDiffFiles";
import { openMarkdownInline } from "./commands/openMarkdownInline";
import { openMarkdownSource } from "./commands/openMarkdownSource";
import { openMermaidPreview } from "./commands/openMermaidPreview";
import { openMermaidSource } from "./commands/openMermaidSource";
import { relativeGoTo } from "./commands/relativeGoTo";
import { terminalPaste } from "./commands/terminalPaste";
import { GitHelpersViewProvider } from "./gitHelpers/GitHelpersView";
import { registerMarkdownInlineEditor } from "./markdownInlineHost";
import { registerMermaidCustomEditor } from "./mermaidEditor/MermaidCustomEditorProvider";
import { registerMarkdownMermaidFeatures } from "./mermaidEditor/registerMarkdownMermaid";
import { LocalPortsViewProvider } from "./ports/LocalPortsView";
import { SnippetViewProvider } from "./snippetEditor/SnippetView";
import { copyScmResourcePath, copyScmResourceRelativePath } from "./scm/copyResourcePath";
import { copyGithubHeadFileUrl } from "./scm/copyGithubHeadFileUrl";
import { registerCommandIB } from "./lib/vscode/vscode";
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
    registerCommandIB(Commands.OpenMarkdownInline, openMarkdownInline, context);
    registerCommandIB(Commands.OpenMarkdownSource, openMarkdownSource, context);
    registerCommandIB(Commands.OpenMermaidPreview, openMermaidPreview, context);
    registerCommandIB(Commands.OpenMermaidSource, openMermaidSource, context);
    registerCommandIB(Commands.CopyScmResourcePath, copyScmResourcePath, context);
    registerCommandIB(Commands.CopyScmResourceRelativePath, copyScmResourceRelativePath, context);
    registerCommandIB(Commands.CopyGithubHeadFileUrl, copyGithubHeadFileUrl, context);

    registerMermaidCustomEditor(context);
    registerMarkdownInlineEditor(context);
    registerMarkdownMermaidFeatures(context);
    SnippetViewProvider.activate(context);
    activateDiskEditorConflict(context);
    activateBranchDiffRevert(context);
    context.subscriptions.push(window.tabGroups.onDidChangeTabs(() => syncBranchDiffWorkingTreeFiles()));
    GitHelpersViewProvider.activate(context);
    LocalPortsViewProvider.activate(context);
}

export function deactivate() {
    SnippetViewProvider.deactivate();
}
