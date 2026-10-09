export const Commands = {
    RelativeGoTo: `ib-utilities.relativeGoTo`,

    OpenSnippet: `ib-utilities.openSnippet`,

    ShowSnippetView: `ib-utilities.showSnippetView`,

    OpenPR: `ib-utilities.openPR`,

    OpenRepo: `ib-utilities.openRepo`,

    CreateDraftPR: `ib-utilities.createDraftPR`,

    MarkPrReady: `ib-utilities.markPrReady`,

    CopyPrUrl: `ib-utilities.copyPrUrl`,

    OpenPrChecks: `ib-utilities.openPrChecks`,

    OpenChangesFile: `ib-utilities.openChangesFile`,

    OpenPrReview: `ib-utilities.openPrReview`,

    RefreshSnippetView: `ib-utilities.refreshSnippetView`,

    AddSnippet: `ib-utilities.addSnippet`,

    EditSnippet: `ib-utilities.editSnippet`,

    DeleteSnippet: `ib-utilities.deleteSnippet`,

    TerminalPaste: `ib-utilities.terminalPaste`,

    OpenMarkdownInline: `ib-utilities.openMarkdownInline`,

    OpenMarkdownSource: `ib-utilities.openMarkdownSource`,

    OpenMermaidPreview: `ib-utilities.openMermaidPreview`,

    OpenMermaidSource: `ib-utilities.openMermaidSource`,

    OpenMermaidMarkdownPreview: `ib-utilities.openMermaidMarkdownPreview`,

    ShowGitHelpers: `ib-utilities.showGitHelpers`,

    RefreshGitHelpers: `ib-utilities.refreshGitHelpers`,

    GitHelpersRefreshing: `ib-utilities.gitHelpersRefreshing`,

    DiffWithBase: `ib-utilities.diffWithBase`,

    SetBaseBranch: `ib-utilities.setBaseBranch`,

    RevertBranchDiffHunk: `ib-utilities.revertBranchDiffHunk`,

    RevertBranchDiffSelection: `ib-utilities.revertBranchDiffSelection`,

    CopyScmResourcePath: `ib-utilities.copyScmResourcePath`,

    CopyScmResourceRelativePath: `ib-utilities.copyScmResourceRelativePath`,

    CopyGithubHeadFileUrl: `ib-utilities.copyGithubHeadFileUrl`,

    RevertToDisk: `ib-utilities.revertToDisk`,

    RefreshLocalPorts: `ib-utilities.refreshLocalPorts`,

    OpenLocalPort: `ib-utilities.openLocalPort`,

    KillLocalPort: `ib-utilities.killLocalPort`,

    ViewSnippetContainer: `workbench.view.snippetContainer`,

} as const;

export type Commands = (typeof Commands)[keyof typeof Commands];

export const ViewContainers = {
      SnippetContainer: `snippetContainer`,

} as const;

export const Views = {
    SnippetView: `snippetView`,

    IbUtilitiesGitHelpers: `ib-utilities.gitHelpers`,

    LocalPorts: `ib-utilities.localPorts`,

} as const;

export const Configuration = {
    LanguageIdMappings: `ib-utilities.languageIdMappings`,

    GeneratedLanguageMappings: `ib-utilities.generatedLanguageMappings`,

    GithubGhPath: `ib-utilities.github.ghPath`,

    GitHelpersDebugMode: `ib-utilities.gitHelpers.debugMode`,

} as const;

export const contributedLanguageIdToExtension: Record<string, string> = {
    "mermaid": ".mmd",
    "gherkin": ".feature",
};
