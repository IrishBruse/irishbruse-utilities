# IrishBruse's Utilities

A [Visual Studio Code](https://code.visualstudio.com/) extension: snippet management, GitHub shortcuts, and small editor helpers.

**Install:** search the Marketplace for **IrishBruse's Utilities** ([publisher `irishbruse`](https://marketplace.visualstudio.com/publishers/irishbruse)) or install from a `.vsix` built from [this repository](https://github.com/IrishBruse/irishbruse-utilities).

**Requirements:** VS Code `^1.125.0` (see `engines.vscode` in `package.json`).

## Features

### Snippet Manager

Tree view under the **Snippet Manager** activity bar: create, edit, and delete snippets in folders; map snippet files to [language IDs](https://code.visualstudio.com/docs/languages/overview) for highlighting; and auto-generate snippets from multiple language sources using the settings below.

### Git Helpers (Source Control)

A **Git Helpers** panel in the Source Control sidebar shows git workflow actions for the **active repository**.
Panel data is cached per repository so switching between local repos restores the last-known state immediately:

- **Pull request** — first row, opens the GitHub PR for the current branch (draft PRs use a draft icon).
  Inline buttons copy the PR URL, open the linked Jira ticket when synced, and mark draft PRs ready
- **Diff** — opens a multi-file diff and reveals the Branch Changes sidebar. Base branch is shown as the row description, with an inline Set base button
- **Changes** — file count row opens the **Branch Changes** secondary sidebar, with `+additions −deletions` as the description
- **Checks** — GitHub Actions status row when a PR is open (check name as label, status as description). Click to open checks
- **Review notes** — add inline comments in git diffs, **Publish to PR** posts line comments via `gh`
- **Create draft PR** — shown when there is no open PR and the branch is not the base branch (hidden on `main` / `master`)

The Git Helpers title bar opens the GitHub repository and refreshes the panel.

### Changed Files (secondary sidebar)

The **Changed Files** view in the secondary sidebar lists files changed against the merge base.
Click **Changes** in Git Helpers to reveal it.
The view header shows `+additions −deletions` and file counts.

### Action Panel

An **Actions** activity bar panel for customizable shortcuts: built-in actions, Cursor agent prompts, VS Code commands, and terminal commands via `ib-utilities.actionPanel.actions`.

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

Customize Action Panel entries (built-in, Cursor agent prompt, VS Code command, or terminal command):

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
    },
    {
      "id": "runTests",
      "label": "Run tests",
      "icon": "beaker",
      "type": "terminal",
      "command": "npm test",
      "terminalMode": "editor"
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
