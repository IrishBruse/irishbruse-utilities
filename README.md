# IrishBruse's Utilities

A [Visual Studio Code](https://code.visualstudio.com/) extension: snippet management, GitHub shortcuts, and small editor helpers.

**Install:** search the Marketplace for **IrishBruse's Utilities** ([publisher `irishbruse`](https://marketplace.visualstudio.com/publishers/irishbruse)) or install from a `.vsix` built from [this repository](https://github.com/IrishBruse/irishbruse-utilities).

**Requirements:** VS Code `^1.125.0` (see `engines.vscode` in `package.json`).

## Features

### Snippet Manager

Tree view under the **Snippet Manager** activity bar: create, edit, and delete snippets in folders; map snippet files to [language IDs](https://code.visualstudio.com/docs/languages/overview) for highlighting; and auto-generate snippets from multiple language sources using the settings below.

### Git Helpers (Source Control)

A **Git Helpers** panel in the Source Control sidebar shows hardcoded git workflow actions for the **active repository**:

- **Diff vs base** — multi-file diff of your branch against an auto-detected base (`main` / `origin/main`, etc.), with a gear control to pick a different comparison branch or commit
- **Review notes** — add inline comments in git diffs. **Publish to PR** posts line comments via `gh`
- **Pull request** — clickable row opens the GitHub PR for the current branch, or **Create draft PR** creates a blank draft when none exists. Title bar button opens the PR (or repo homepage if none)

### Action Panel

An **Actions** activity bar panel for customizable shortcuts: built-in actions, Cursor agent prompts, and VS Code commands via `ib-utilities.actionPanel.actions`.

### Relative goto

**Relative goto** jumps by line in the active editor: relative forward, `-` prefix for relative backward, or a leading space for an absolute line number (see the command prompt when you run it).

### Theme

**Empty Dark Theme** is contributed as an optional dark UI theme (see **Preferences: Color Theme**).

### Mermaid Preview

Open `.mmd` or `.mermaid` files in the **Mermaid Preview** custom editor for live diagram rendering that follows your VS Code color theme. Use the toolbar to zoom, pan, fit to view, or copy the diagram as PNG. Switch back to source with **Open Source** from the editor title bar.

## Configuration

Map snippet file labels to VS Code language IDs:

```json
{
  "ib-utilities.languageIdMappings": {
    "node": "typescript",
    "react": "typescriptreact"
  }
}
```

Control auto-generated snippet languages (left: target language ID; right: comma-separated source labels):

```json
{
  "ib-utilities.generatedLanguageMappings": {
    "typescriptreact": "node,react"
  }
}
```

Customize Action Panel entries (built-in, Cursor agent prompt, or VS Code command):

```json
{
  "ib-utilities.actionPanel.actions": [
    {
      "id": "createPR",
      "label": "Create PR",
      "icon": "git-pull-request-create",
      "type": "agent",
      "prompt": "/pr create",
      "terminalName": "Create PR"
    },
    {
      "id": "custom",
      "label": "Run tests",
      "icon": "beaker",
      "type": "command",
      "command": "workbench.action.tasks.runTask",
      "args": ["test"]
    }
  ]
}
```

## Commands

| Command | Title |
| --- | --- |
| `ib-utilities.relativeGoTo` | Relative goto |
| `ib-utilities.openSnippet` | Open Snippet |
| `ib-utilities.showSnippetView` | Show Snippet View |
| `ib-utilities.openPR` | Open Pull Request |
| `ib-utilities.refreshSnippetView` | Refresh Snippets |
| `ib-utilities.addSnippet` | Add new snippet |
| `ib-utilities.editSnippet` | Edit snippet |
| `ib-utilities.deleteSnippet` | Delete snippet |
| `ib-utilities.openMermaidPreview` | Open Preview |
| `ib-utilities.openMermaidSource` | Open Source |
| `ib-utilities.showActionPanel` | Show Action Panel |
| `ib-utilities.showGitHelpers` | Show Git Helpers |
| `ib-utilities.createDraftPR` | Create Draft Pull Request |
| `ib-utilities.runActionPanelItem` | Run Action Panel Item |
| `ib-utilities.diffWithBase` | Diff vs Base Branch |
| `ib-utilities.setBaseBranch` | Set base branch for diffs and review notes |
| `ib-utilities.addReviewNote` | Add Review Note |
| `ib-utilities.publishReviewToPR` | Publish Review to PR |
| `ib-utilities.exportReviewSummary` | Export Review Summary |

## Development

```bash
npm install
npm run verify
```

- **Build:** `npm run build`
- **Tests:** `npm run test`
- **Lint:** `npm run lint`

See [`AGENTS.md`](./AGENTS.md) for contributor notes (including `fnm` for Node versions).

## License

[MIT](LICENSE.md)
