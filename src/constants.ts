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
     * Edit snippet file
     * Short Title: Edit snippet
     * Icon: $(edit)
     */
    EditSnippetFile = `ib-utilities.editSnippetFile`,

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
