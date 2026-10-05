---
name: markdown-inline
description: "Inline Markdown editor and playground work under src/markdownInline. Use when changing reveal, caret, preview, or other editor behavior. Before the first edit, state the Change line and the Hold line, then continue."
---

Scope work to `src/markdownInline`, not `src/markdownEditor`. Read `src/markdownInline/AGENTS.md` for the package boundary (`src/` must not import extension or sibling packages).

## Change and Hold

Before the first edit of editor behavior, write two sentences in the reply, then continue in that same turn.

Change: the one behavior that will change.
Hold: the nearby behavior that stays as it is. Hold names only a behavior the user ask or the feature README already states.

Grain is one interaction. A caret on the marker character is a different behavior from a caret elsewhere on that line.

A complaint that already names the feature, the steps, and the wrong result still gets both sentences. Skip the longer questions and continue.

## Playground

Treat `/home/econn/.config/Code/User/settings.json` as the reference for VS Code user settings when you check theme, colors, or fonts in the playground.
The playground loads that path on Linux, match behavior to what those settings imply, not to ad hoc values in the repo.
The playground loads `playground/vscode-iframe-injected-theme.css` (a real copy of VS Code webview iframe `--vscode-*` tokens, see `playground/AGENTS.md`), then applies settings overrides from `settings.json`.
