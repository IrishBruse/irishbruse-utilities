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
- **Create draft PR** — shown when there is no open PR and the branch is not the base branch (hidden on `main` / `master`)

The Git Helpers title bar opens the GitHub repository and refreshes the panel.

Right-click any file in the file explorer for **Copy GitHub Head URL** (blob link at the current branch `HEAD`). Under **Source Control → Changes**, right-click for **Copy Path**, **Copy Relative Path**, and **Copy GitHub Head URL**.

### Changed Files (secondary sidebar)

The **Changed Files** view in the secondary sidebar lists files changed against the merge base.
Click **Changes** in Git Helpers to reveal it.
The view header shows `+additions −deletions` and file counts.
Right-click a file for **Copy GitHub Head URL**.

### Action Panel

An **Actions** activity bar panel for customizable shortcuts: built-in actions, Cursor agent prompts, VS Code commands, and terminal commands via `ib-utilities.actionPanel.actions`.

### Relative goto

**Relative goto** jumps by line in the active editor: relative forward, `-` prefix for relative backward, or a leading space for an absolute line number (see the command prompt when you run it).

### Theme

**Empty Dark Theme** is contributed as an optional dark UI theme (see **Preferences: Color Theme**).

### Markdown Editor (ib-utilities)

Open `*.md` files with **Markdown Editor (ib-utilities)** from **Reopen Editor With...**. The custom editor is optional, so it is not the default Markdown editor.

The editor shows WYSIWYG Markdown with colors from the active theme, fenced-code highlighting, a language label on inactive code blocks, and HTML preview for inactive HTML blocks.

Tables open as a grid. Edit a cell, add a row or column from the gap controls, and select a row or column from the cell border. Then press Backspace or Delete to remove that row or column.

### Mermaid Preview

Open `.mmd` or `.mermaid` files as **source text** by default (including branch diffs and `vscode.diff`). Use **Open Preview** from the editor title bar or the `ib-utilities.openMermaidPreview` command for live diagram rendering that follows your VS Code color theme. In preview, use the toolbar to zoom, pan, fit to view, or copy the diagram as PNG. Switch back to source with **Open Source**.

In Markdown files, `` ```mermaid `` `` blocks get embedded syntax highlighting. Use the **Open Preview** CodeLens above a block, or Ctrl/Cmd+click the `mermaid` language tag, to open the same preview (edits to the block in markdown stay in sync while the preview is open).

Clickable nodes (flowchart `click … href`, Gantt task links, and similar) open in the editor. Location formats (tooltip is preferred when present):

- **GBL / compiler style (preferred):** `path:line:column` in the second `click` string (e.g. `../test.gbl:12:1`). The first string may use the same location or a plain path; the preview normalizes to `path` + `path:line:column` because Mermaid breaks SVG links when `href` contains `:line:column`.
- **VS Code URI fragment:** `path#Lline,column` (e.g. `../test.gbl#L12,5`) — matches VS Code’s documented `L3,5` fragment form.
- **GitHub / web:** `path#Lline` (e.g. `../test.gbl#L12`) — line only; column defaults to 1.

`http(s)` and `mailto:` links open in your browser. Hover a linked node for a short custom label. Hold **Ctrl** or **Cmd** while clicking to open beside the active tab.

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
| `ib-utilities.setBaseBranch` | Set base branch for diffs |

## Development

```bash
npm install
npm run verify
```

- **Build:** `npm run build`
- **Tests:** `npm run test`
- **Lint:** `npm run lint`
- **Install locally:** `npm run install:local` (packages a VSIX and installs it via `cursor` or `code`; override with `VSCODE_CLI`)

See [`AGENTS.md`](./AGENTS.md) for contributor notes (including `fnm` for Node versions).

## License

[MIT](LICENSE.md)
