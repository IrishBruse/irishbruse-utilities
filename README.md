# IrishBruse's Utilities

A [Visual Studio Code](https://code.visualstudio.com/) extension: snippet management, GitHub shortcuts, and small editor helpers.

**Install:** search the Marketplace for **IrishBruse's Utilities** ([publisher `irishbruse`](https://marketplace.visualstudio.com/publishers/irishbruse)) or install from a `.vsix` built from [this repository](https://github.com/IrishBruse/irishbruse-utilities).

**Requirements:** VS Code `^1.110.0` (see `engines.vscode` in `package.json`).

## Features

### Snippet Manager

Tree view under the **Snippet Manager** activity bar: create, edit, and delete snippets in folders; map snippet files to [language IDs](https://code.visualstudio.com/docs/languages/overview) for highlighting; and auto-generate snippets from multiple language sources using the settings below.

### GitHub

From the Source Control title bar (when using Git), **Open Pull Request** opens the PR for the current branch in the browser (via `git`, not the GitHub CLI).

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
