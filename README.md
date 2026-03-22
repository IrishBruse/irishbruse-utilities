# IrishBruse's Utilities

A collection of utilities for managing code snippets and GitHub workflows.

## Features

### Snippet Manager
A tree-based snippet editor with the following capabilities:
- Create, edit, and delete snippets organized in folders
- Map snippets to language IDs for proper syntax highlighting
- Auto-generate snippets from multiple language sources

### GitHub Integration
- Open the current branch's pull request directly from the SCM menu

### Configuration
Configure language ID mappings for snippets:
```json
{
  "ib-utilities.languageIdMappings": {
    "node": "typescript",
    "react": "typescriptreact"
  }
}
```

Configure auto-generated language mappings:
```json
{
  "ib-utilities.generatedLanguageMappings": {
    "typescriptreact": "node,react"
  }
}
```

## Commands

| Command                           | Description                            |
| --------------------------------- | -------------------------------------- |
| `ib-utilities.relativeGoTo`       | Navigate to files using relative paths |
| `ib-utilities.openSnippet`        | Open a snippet file                    |
| `ib-utilities.showSnippetView`    | Show the snippet manager view          |
| `ib-utilities.openPR`             | Open the current branch's pull request |
| `ib-utilities.refreshSnippetView` | Refresh the snippet tree               |
| `ib-utilities.addSnippet`         | Add a new snippet                      |
| `ib-utilities.editSnippet`        | Edit an existing snippet               |
| `ib-utilities.deleteSnippet`      | Delete a snippet                       |
| `ib-utilities.pasteImage`         | Paste an image from clipboard          |
