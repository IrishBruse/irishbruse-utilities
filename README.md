# IrishBruse's Utilities

A [Visual Studio Code](https://code.visualstudio.com/) extension: snippet management, an [Agent Client Protocol](https://agentclientprotocol.com/) (ACP) chat UI (**IB Chat**), GitHub shortcuts, and small editor helpers.

**Install:** search the Marketplace for **IrishBruse's Utilities** ([publisher `irishbruse`](https://marketplace.visualstudio.com/publishers/irishbruse)) or install from a `.vsix` built from [this repository](https://github.com/IrishBruse/irishbruse-utilities).

**Requirements:** VS Code `^1.110.0` (see `engines.vscode` in `package.json`).

## Features

### Snippet Manager

Tree view under the **Snippet Manager** activity bar: create, edit, and delete snippets in folders; map snippet files to [language IDs](https://code.visualstudio.com/docs/languages/overview) for highlighting; and auto-generate snippets from multiple language sources using the settings below.

### IB Chat

**IB Chat** runs as an ACP client: it spawns configured agents, talks to them over JSON-RPC on stdio, and shows the session in an editor webview. Use the **Chats** sidebar to open, refresh, or remove sessions; **New IB Chat in Editor** starts a chat in the editor area. Agent processes are defined in `ib-utilities.acpAgents` (see [Configuration](#configuration)).

### GitHub

From the Source Control title bar (when using Git), **Open Pull Request** opens the PR for the current branch in the browser (via `git`, not the GitHub CLI).

### Clipboard and paste

- **Paste Image** (Explorer context menu or command): save a clipboard image into the workspace under the selected folder.
- **Smart paste** (default keybinding): if the clipboard holds an image, save it like **Paste Image**; otherwise perform the normal editor or Explorer paste.

### Relative goto

**Relative goto** jumps by line in the active editor: relative forward, `-` prefix for relative backward, or a leading space for an absolute line number (see the command prompt when you run it).

### Theme

**Empty Dark Theme** is contributed as an optional dark UI theme (see **Preferences: Color Theme**).

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

Register ACP agents for IB Chat (each entry is a subprocess: `command`, optional `args`, optional `env`):

```json
{
  "ib-utilities.acpAgents": [
    {
      "name": "Example",
      "command": "npx",
      "args": ["-y", "some-acp-agent"],
      "env": {}
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
| `ib-utilities.focusIbChatSessions` | Focus IB Chat Chats list |
| `ib-utilities.newIbChatEditor` | New IB Chat in Editor |
| `ib-utilities.refreshIbChatSessions` | Refresh IB Chat list |
| `ib-utilities.openIbChatSession` | Open IB Chat session |
| `ib-utilities.deleteIbChatSession` | Delete IB Chat |
| `ib-utilities.openPR` | Open Pull Request |
| `ib-utilities.pasteImage` | Paste Image |
| `ib-utilities.smartPaste` | Smart paste |
| `ib-utilities.refreshSnippetView` | Refresh Snippets |
| `ib-utilities.addSnippet` | Add new snippet |
| `ib-utilities.editSnippet` | Edit snippet |
| `ib-utilities.deleteSnippet` | Delete snippet |

## Keyboard shortcuts

Default bindings from `package.json`:

| Key | When | Command |
| --- | --- | --- |
| `Ctrl+Shift+V` | Files Explorer focused | Paste Image |
| `Ctrl+V` | Editor focused | Smart paste |
| `Ctrl+V` | Files Explorer focused | Smart paste |

(On macOS, `Ctrl` may appear as `⌃` in the UI; VS Code resolves keybindings per platform.)

## Development

```bash
npm install
npm run verify
```

- **Build:** `npm run build` (includes the IB Chat webview build).
- **Tests:** `npm run test`
- **Lint:** `npm run lint`

See [`AGENTS.md`](./AGENTS.md) for contributor notes (including `fnm` for Node versions).

## License

[MIT](LICENSE.md)
