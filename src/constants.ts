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
     * Focus IB Chat Chats list
     * Short Title: Focus Chats list
     * Icon: undefined
     */
    FocusIbChatSessions = `ib-utilities.focusIbChatSessions`,

    /**
     * New IB Chat in Editor
     * Short Title: New in Editor
     * Icon: $(add)
     */
    NewIbChatEditor = `ib-utilities.newIbChatEditor`,

    /**
     * Refresh IB Chat list
     * Short Title: Refresh
     * Icon: $(refresh)
     */
    RefreshIbChatSessions = `ib-utilities.refreshIbChatSessions`,

    /**
     * Open IB Chat session
     * Short Title: Open
     * Icon: undefined
     */
    OpenIbChatSession = `ib-utilities.openIbChatSession`,

    /**
     * Delete IB Chat
     * Short Title: Delete
     * Icon: $(trash)
     */
    DeleteIbChatSession = `ib-utilities.deleteIbChatSession`,

    /**
     * Open Pull Request
     * Short Title: Open PR
     * Icon: $(github)
     */
    OpenPR = `ib-utilities.openPR`,

    /**
     * Paste Image
     * Short Title: Paste Image
     * Icon: $(clippy)
     */
    PasteImage = `ib-utilities.pasteImage`,

    /**
     * Smart paste
     * Short Title: Paste
     * Icon: undefined
     */
    SmartPaste = `ib-utilities.smartPaste`,

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
     * Snippet Manager
     */
    ViewSnippetContainer = `workbench.view.snippetContainer`,

    /**
     * IB Chat
     */
    ViewIbChatContainer = `workbench.view.ibChatContainer`,

}

/** View Containers */
export enum ViewContainers {
    /**
     * Snippet Manager
     * Icon: media/snippet_icon.svg
     */
      SnippetContainer = `snippetContainer`,

    /**
     * IB Chat
     * Icon: media/chat_icon.svg
     */
      IbChatContainer = `ibChatContainer`,

}

/** Views */
export enum Views {
    /**
     * Header: Groups
     * ContainerId: snippetContainer
     */
    SnippetView = `snippetView`,

    /**
     * Header: Chats
     * ContainerId: ibChatContainer
     */
    IbChatSessionsView = `ibChatSessionsView`,

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
     * ACP agent configurations. Each entry defines an agent subprocess to launch.
     */
    AcpAgents = `ib-utilities.acpAgents`,

}
