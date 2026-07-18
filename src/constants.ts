// This file is auto-generated. Do not modify directly.

/** Commands */
export enum Commands {
    /**
     * Relative goto
     * Short Title: Relative goto
     * Icon: undefined
     */
    RelativeGoTo = `ib-utilities.relativeGoTo`,

    /**
     * Open Snippet
     * Short Title: Open
     * Icon: undefined
     */
    OpenSnippet = `ib-utilities.openSnippet`,

    /**
     * Show Snippet View
     * Short Title: Show Snippet View
     * Icon: undefined
     */
    ShowSnippetView = `ib-utilities.showSnippetView`,

    /**
     * Open Pull Request
     * Short Title: Open PR
     * Icon: $(github)
     */
    OpenPR = `ib-utilities.openPR`,

    /**
     * Refresh Snippets
     * Short Title: Refresh
     * Icon: $(refresh)
     */
    RefreshSnippetView = `ib-utilities.refreshSnippetView`,

    /**
     * Add new snippet
     * Short Title: Add snippet
     * Icon: $(add)
     */
    AddSnippet = `ib-utilities.addSnippet`,

    /**
     * Edit snippet
     * Short Title: Edit snippet
     * Icon: $(edit)
     */
    EditSnippet = `ib-utilities.editSnippet`,

    /**
     * Delete snippet
     * Short Title: Delete snippet
     * Icon: $(trash)
     */
    DeleteSnippet = `ib-utilities.deleteSnippet`,

    /**
     * Open Preview
     * Short Title: Open Preview
     * Icon: $(open-preview)
     */
    OpenMermaidPreview = `ib-utilities.openMermaidPreview`,

    /**
     * Open Source
     * Short Title: Open Source
     * Icon: $(code)
     */
    OpenMermaidSource = `ib-utilities.openMermaidSource`,

    /**
     * Refresh Git Helpers
     * Short Title: Refresh
     * Icon: $(refresh)
     */
    RefreshGitHelpers = `ib-utilities.refreshGitHelpers`,

    /**
     * Show Git Helpers
     * Short Title: Git Helpers
     * Icon: $(git-branch)
     */
    ShowGitHelpers = `ib-utilities.showGitHelpers`,

    /**
     * Diff vs Base Branch
     * Short Title: Diff vs base
     * Icon: $(diff)
     */
    DiffWithBase = `ib-utilities.diffWithBase`,

    /**
     * Start Branch Review
     * Short Title: Start review
     * Icon: $(eye)
     */
    StartBranchReview = `ib-utilities.startBranchReview`,

    /**
     * Abort Branch Review
     * Short Title: Abort review
     * Icon: $(discard)
     */
    AbortBranchReview = `ib-utilities.abortBranchReview`,

    /**
     * Open Staged Review
     * Short Title: Staged review
     * Icon: $(list-flat)
     */
    OpenStagedReview = `ib-utilities.openStagedReview`,

    /**
     * Exclude Selection from Review
     * Short Title: Exclude from review
     * Icon: $(diff-removed)
     */
    ExcludeFromReview = `ib-utilities.excludeFromReview`,

    /**
     * Add Review Note
     * Short Title: Add note
     * Icon: $(note)
     */
    AddReviewNote = `ib-utilities.addReviewNote`,

    /**
     * Publish Review to PR
     * Short Title: Publish to PR
     * Icon: $(comment-discussion)
     */
    PublishReviewToPR = `ib-utilities.publishReviewToPR`,

    /**
     * Export Review Summary
     * Short Title: Export summary
     * Icon: $(export)
     */
    ExportReviewSummary = `ib-utilities.exportReviewSummary`,

    /**
     * Snippet Manager
     */
    ViewSnippetContainer = `workbench.view.snippetContainer`,

}

/** View Containers */
export enum ViewContainers {
    /**
     * Snippet Manager
     * Icon: media/snippet_icon.svg
     */
      SnippetContainer = `snippetContainer`,

}

/** Views */
export enum Views {
    /**
     * Header: Groups
     * ContainerId: snippetContainer
     */
    SnippetView = `snippetView`,

    /**
     * Header: Git Helpers
     * ContainerId: scm
     */
    IbUtilitiesGitHelpers = `ib-utilities.gitHelpers`,

}

/** Configuration Properties */
export enum Configuration {
    /**
     * Map snippet files to known language ID.
     */
    LanguageIdMappings = `ib-utilities.languageIdMappings`,

    /**
     * On the left is the languageId for the snippet to auto generate on the right is the comma delimited array of languages to build it from.
     */
    GeneratedLanguageMappings = `ib-utilities.generatedLanguageMappings`,

}

/** Primary file extension per language id from this extension contributes.languages */
export const contributedLanguageIdToExtension: Record<string, string> = {
    "gherkin": ".feature",
};
