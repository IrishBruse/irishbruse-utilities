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
     * Show Git Helpers
     * Short Title: Git Helpers
     * Icon: $(git-branch)
     */
    ShowGitHelpers = `ib-utilities.showGitHelpers`,

    /**
     * Show Action Panel
     * Short Title: Actions
     * Icon: $(run-all)
     */
    ShowActionPanel = `ib-utilities.showActionPanel`,

    /**
     * Run Action Panel Item
     * Short Title: undefined
     * Icon: $(run)
     */
    RunActionPanelItem = `ib-utilities.runActionPanelItem`,

    /**
     * Add Action
     * Short Title: Add action
     * Icon: $(add)
     */
    AddActionPanelAction = `ib-utilities.addActionPanelAction`,

    /**
     * Edit Action
     * Short Title: Edit action
     * Icon: $(edit)
     */
    EditActionPanelAction = `ib-utilities.editActionPanelAction`,

    /**
     * Delete Action
     * Short Title: Delete action
     * Icon: $(trash)
     */
    DeleteActionPanelAction = `ib-utilities.deleteActionPanelAction`,

    /**
     * Diff vs Base Branch
     * Short Title: Diff vs base
     * Icon: $(diff)
     */
    DiffWithBase = `ib-utilities.diffWithBase`,

    /**
     * Set Base Branch
     * Short Title: Set base
     * Icon: $(gear)
     */
    SetBaseBranch = `ib-utilities.setBaseBranch`,

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
     * Save
     * Short Title: undefined
     * Icon: undefined
     */
    ReviewCommentCreate = `ib-utilities.reviewComment.create`,

    /**
     * Save
     * Short Title: undefined
     * Icon: undefined
     */
    ReviewCommentSave = `ib-utilities.reviewComment.save`,

    /**
     * Cancel
     * Short Title: undefined
     * Icon: undefined
     */
    ReviewCommentCancel = `ib-utilities.reviewComment.cancel`,

    /**
     * Delete
     * Short Title: undefined
     * Icon: $(trash)
     */
    ReviewCommentDelete = `ib-utilities.reviewComment.delete`,

    /**
     * Edit note
     * Short Title: undefined
     * Icon: $(edit)
     */
    ReviewCommentEdit = `ib-utilities.reviewComment.edit`,

    /**
     * Snippet Manager
     */
    ViewSnippetContainer = `workbench.view.snippetContainer`,

    /**
     * Actions
     */
    ViewActionPanel = `workbench.view.actionPanel`,

}

/** View Containers */
export enum ViewContainers {
    /**
     * Snippet Manager
     * Icon: media/snippet_icon.svg
     */
      SnippetContainer = `snippetContainer`,

    /**
     * Actions
     * Icon: $(run-all)
     */
      ActionPanel = `actionPanel`,

}

/** Views */
export enum Views {
    /**
     * Header: Groups
     * ContainerId: snippetContainer
     */
    SnippetView = `snippetView`,

    /**
     * Header: Actions
     * ContainerId: actionPanel
     */
    IbUtilitiesActionPanel = `ib-utilities.actionPanel`,

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

    /**
     * Actions shown in the Action Panel. Cursor agent prompts use type "agent"; VS Code commands use type "command".
     */
    ActionPanelActions = `ib-utilities.actionPanel.actions`,

}

/** Primary file extension per language id from this extension contributes.languages */
export const contributedLanguageIdToExtension: Record<string, string> = {
    "gherkin": ".feature",
};
