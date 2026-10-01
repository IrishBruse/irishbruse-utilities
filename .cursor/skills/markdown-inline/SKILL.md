---
name: markdown-inline
description: markdown-inline
---

Scope work to `src/markdownInline`, not `src/markdownEditor`. Read `src/markdownInline/AGENTS.md` for the package boundary (`src/` must not import extension or sibling packages).

## Playground

Treat `/home/econn/.config/Code/User/settings.json` as the reference for VS Code user settings when you check theme, colors, or fonts in the playground.
The playground loads that path on Linux; match behavior to what those settings imply, not to ad hoc values in the repo.
The playground loads `playground/vscode-iframe-injected-theme.css` (a real copy of VS Code webview iframe `--vscode-*` tokens; see `playground/AGENTS.md`), then applies settings overrides from `settings.json`.
