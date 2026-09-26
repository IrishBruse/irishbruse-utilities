---
name: agent-browser-vscode-extension
description: "Drive an isolated VS Code Extension Development Host with agent-browser CDP to test ib-utilities. Use when verifying the extension in VS Code, attaching agent-browser to Code, launching an isolated host, or taking workbench screenshots. Not for the user's daily Cursor/Code window."
---

# agent-browser-vscode-extension

Load CLI usage from the installed binary, then follow this repo's host rules.

```bash
agent-browser skills get electron
agent-browser skills get core
```

## 1. Choose a host

| Host | When |
| :--- | :--- |
| Isolated Extension Development Host | Local workspace (default). |
| Unpacked VSIX in a unique `--extensions-dir` | Testing a packaged build. |
| Daily `~/.vscode/extensions` or the user's Code | Never. It may be stale and has no CDP. |

**Done when:** the window under test is a new Code process with `--user-data-dir` under this repo's `.tmp/`.

## 2. Launch

Prefer [scripts/launch-extension-host.sh](scripts/launch-extension-host.sh):

```bash
npm run build
.cursor/skills/agent-browser-vscode-extension/scripts/launch-extension-host.sh
# optional folder: .../launch-extension-host.sh docs/tests/markdown
```

Flags, ports, and profile paths: [isolated-host.md](isolated-host.md).

**Done when:** a window titled **Extension Development Host** is up and CDP answers on the printed port.

## 3. Connect once

```bash
agent-browser --session ib-ext connect "$PORT"
agent-browser --session ib-ext snapshot -i
```

Keep `--session ib-ext` on every command. Skip `connect` if this session already shows the workbench. `connect` can relaunch agent-browser onto `about:blank`.

**Done when:** `snapshot -i` lists Explorer, editor tabs, and title-bar buttons (not a blank page).

## 4. Drive the workbench

1. `snapshot -i` immediately before each click.
2. Click `@eN` from that snapshot only.
3. After the UI changes, snapshot again.
4. Custom-editor / preview content: [webview.md](webview.md).

**Done when:** every click used a ref from the latest snapshot.

## 5. Screenshots

```bash
agent-browser --session ib-ext screenshot path/to/out.png
```

Omit `--color-scheme`. Dark color-scheme yields black PNGs of this workbench.

Read the PNG before treating the step as verified.

**Done when:** the file is a real workbench capture (Explorer + editor), not a black frame.

## Guardrails

Leave the user's existing Cursor/Code (`~/.config/Code`) running. Close only the isolated host you started, and only when the user asks.
