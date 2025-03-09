// This file is auto-generated. Do not modify directly.

/** Commands */
export enum Commands {
    /**
     * IB: Relative goto
     * Short Title: Relative goto
     */
    RelativeGoTo = `ib-utilities.relativeGoTo`,

    /**
     * IB: Open Snippet
     * Short Title: Open
     */
    OpenSnippet = `ib-utilities.openSnippet`,

    /**
     * IB: Show Snippet View
     * Short Title: Show Snippet View
     */
    ShowSnippetView = `ib-utilities.showSnippetView`,

    /**
     * IB: Open Pull Request
     * Short Title: Open PR
     * Icon: $(github)
     */
    OpenPR = `ib-utilities.openPR`,

    /**
     * IB: Refresh Snippets
     * Short Title: Refresh
     * Icon: $(refresh)
     */
    RefreshSnippetView = `ib-utilities.refreshSnippetView`,

    /**
     * Snippet
     */
    ViewSnippetContainer = `workbench.view.snippetContainer`,

}

/** View Containers */
export enum ViewContainers {
    /**
     * Snippet
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
