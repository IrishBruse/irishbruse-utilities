# IrishBruse's Utilities Contributions

A collection of utilities made by me

## Commands

### Relative goto

![ib-utilities.relativeGoTo Screenshot](docs/commands/ib-utilities.relativeGoTo.png)

-   **Command:** `ib-utilities.relativeGoTo`
-   **Short Title:** Relative goto
-   **Icon:** undefined

### Open Snippet

![ib-utilities.openSnippet Screenshot](docs/commands/ib-utilities.openSnippet.png)

-   **Command:** `ib-utilities.openSnippet`
-   **Short Title:** Open
-   **Icon:** undefined

### Show Snippet View

![ib-utilities.showSnippetView Screenshot](docs/commands/ib-utilities.showSnippetView.png)

-   **Command:** `ib-utilities.showSnippetView`
-   **Short Title:** Show Snippet View
-   **Icon:** undefined

### Open Pull Request

![ib-utilities.openPR Screenshot](docs/commands/ib-utilities.openPR.png)

-   **Command:** `ib-utilities.openPR`
-   **Short Title:** Open PR
-   **Icon:** $(github)

### Refresh Snippets

![ib-utilities.refreshSnippetView Screenshot](docs/commands/ib-utilities.refreshSnippetView.png)

-   **Command:** `ib-utilities.refreshSnippetView`
-   **Short Title:** Refresh
-   **Icon:** $(refresh)

### Add new snippet

![ib-utilities.addSnippet Screenshot](docs/commands/ib-utilities.addSnippet.png)

-   **Command:** `ib-utilities.addSnippet`
-   **Short Title:** Add snippet
-   **Icon:** $(add)

### Edit snippet file

![ib-utilities.editSnippetFile Screenshot](docs/commands/ib-utilities.editSnippetFile.png)

-   **Command:** `ib-utilities.editSnippetFile`
-   **Short Title:** Edit snippet
-   **Icon:** $(edit)

## View Containers

### Snippet Manager

-   **ID:** `snippetContainer`
-   **Icon:** [media/snippet_icon.svg](media/snippet_icon.svg)

## Views

### Groups

-   **ID:** `snippetView`
-   **Container:** `snippetContainer`

## Configuration Properties

### LanguageIdMappings

Map snippet files to known language ID.
-   **Key:** `ib-utilities.languageIdMappings`

### GeneratedLanguageMappings

On the left is the languageId for the snippet to auto generate on the right is the comma delimited array of languages to build it from.
-   **Key:** `ib-utilities.generatedLanguageMappings`

## Menus

### Scm/title

- **Command:** `ib-utilities.openPR`
  - **Condition:** `scmProvider == git`
  - **Group:** `navigation`

### View/item/context

- **Command:** `ib-utilities.editSnippetFile`
  - **Condition:** `view == snippetView && viewItem == language`
  - **Group:** `inline`

- **Command:** `ib-utilities.addSnippet`
  - **Condition:** `view == snippetView && viewItem == language`
  - **Group:** `inline`

### View/title

- **Command:** `ib-utilities.showSnippetView`
  - **Condition:** `view == snippetContainer`
  - **Group:** `navigation`

- **Command:** `ib-utilities.refreshSnippetView`
  - **Condition:** `view == snippetView`
  - **Group:** `navigation`

## Themes

### Empty Dark Theme

- **ID:** `undefined`
- **Name:** `Empty Dark Theme`
- **Base Theme:** `vs-dark`
