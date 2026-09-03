# Changelog

## Unreleased

-   Fix: Markdown Editor fenced code blocks use plain editor text color instead of yellow default
-   Change: Sync Markdown Editor webview source with VS Code main and bump `@vscode/markdown-editor` to `0.0.2-87`

## 0.19.0

-   Add: Custom **Markdown Editor (ib-utilities)** for `*.md` with theme-aware colors, fenced-code highlighting from the active color theme, a language badge on code blocks, and HTML block preview
-   Add: Confluence-style table grid with per-cell Markdown editing, add row/column, and row/column delete
-   Fix: Keyboard input in the Markdown Editor (Backspace and other keys)
-   Fix: Table cell overlay matches preview height and position; cell edits save when you leave the cell or the table

## 0.18.2

-   Fix: Copy GitHub Head URL for folders (GitHub tree links) and context menu order after Copy Path and Copy Relative Path

## 0.18.1

-   Fix: Copy GitHub Head URL in file explorer on remote workspaces (SSH, WSL, and similar) and from editor tab context menu

## 0.18.0

-   Add: Copy GitHub Head URL on Source Control changed files, Changed Files sidebar, and file explorer context menu
-   Fix: Markdown mermaid fenced-code syntax highlighting when injection re-matched entire code blocks instead of embedding inside VS Code's built-in markdown fences

## 0.17.0

-   Add: Markdown `mermaid` fenced code blocks with syntax highlighting, **Open Preview** CodeLens, and a link on the `mermaid` tag to open the themed preview (diagram links resolve relative to the markdown file)

## 0.16.0

-   Add: Mermaid preview with themed rendering, toolbar (zoom, pan, fit, copy PNG), and GBL call-graph navigation (`click … href` opens workspace files at `path:line:column`, plus VS Code `#Lline,column` and GitHub `#Lline` href forms)
-   Change: `.mmd` and `.mermaid` open as source by default, including diffs; use **Open Preview** for the live diagram
-   Change: Custom link hover labels in Mermaid preview instead of native SVG `title` tooltips
-   Fix: Mermaid diagram titles and cluster labels use editor foreground instead of default gold styling
-   Fix: Linked-node clicks in preview (co-located paths like `test.txt`, Mermaid 11 node ids, pan/zoom, and invalid colon `href` values)

## 0.15.0

-   Add: Copy Path and Copy Relative Path on Source Control changed-file context menu

## 0.14.0

-   Remove: Branch diff review notes, gutter comments, and publish-to-PR comment workflow

## 0.13.1

-   Add: Optional `ib-utilities.github.ghPath` setting for an absolute path to the GitHub CLI when `gh` is not on PATH (for example in VS Code on macOS)

## 0.13.0

-   Add: Branch Changes sidebar with `+/-` file counts, Open repo action, and reveal from Git Helpers Diff
-   Change: Git Helpers panel reorganized — PR and Checks rows consolidated, draft/open PR icons, inline Jira buttons, checks status as panel row, and hide checks when none exist
-   Change: Git Helpers workflow — Diff opens multi-file diff; Publish to PR only without an open PR; Create draft PR hidden on main/master and base branch; strip Jira key prefix from picker display text
-   Change: Changed Files sidebar — collapse/expand toggles all folders; remove Open repo button; shorten view title
-   Add: Git Helpers debug mode with mock panel data for development
-   Remove: Copy Jira key inline button from Git Helpers PR row

## 0.12.0

-   Add: Action Panel terminal command actions with panel, editor space, or background run modes
-   Add: Git Helpers per-repository cache so switching between local repos shows the last-known panel immediately
-   Change: Action Panel add/edit form styling aligned with VS Code sidebar panels
-   Change: Mermaid preview pans with left click on non-text areas, while text labels remain selectable
-   Change: Mermaid preview shows grab and grabbing cursors while panning with left or middle click
-   Remove: Generated codicon SVG assets; Action Panel tree icons now use VS Code ThemeIcon

## 0.11.0

-   Add: Git Helpers panel — diff vs base, draft PR workflow, PR status, files changed, review threads, failed checks, and optional Jira ticket row
-   Add: Action Panel for customizable agent prompts and VS Code command shortcuts
-   Add: Branch diff review notes with gutter comments, side panel editor, and publish to GitHub PR
-   Change: Action Panel actions save to user settings, snippet loading uses native JSON instead of `cjson`
-   Change: Update dependencies and use native Node 24 for contributes generation
-   Change: Minimum VS Code version `^1.125.0`

## 0.10.0

-   Add: Mermaid preview custom editor for `.mmd` and `.mermaid` files
-   Add: Live diagram rendering with VS Code theme integration
-   Add: Zoom, pan, fit-to-view, and copy diagram as PNG
-   Add: Open Preview / Open Source commands in the editor title bar

## 0.9

-   Add: Mermaid preview custom editor for `.mmd` and `.mermaid` files
-   Add: Live rendering with VS Code theme integration, zoom/pan/fit, and copy as PNG

## 0.8

-   Add: Gherkin language support and Gherkin fenced code blocks in Markdown
-   Remove: Paste Image and Smart paste commands

## 0.7

-   Add: Smart paste command for clipboard images and file paths

## 0.6

-   Fix: Snippet manager refresh and editing
-   Fix: Paste image reliability

## 0.5

-   Add: Paste Image command with configurable workspace save path
-   Change: Snippet manager refactor and performance improvements

## 0.4

-   Add: Create, edit, and delete snippet commands in the Snippet Manager
-   Change: Snippet editor improvements

## 0.3

-   Add: Snippet Manager tree view with open snippet and refresh commands
-   Add: Language ID mappings and auto-generated snippet language settings
-   Add: Contributions auto-generator from TypeScript constants
-   Fix: Open PR uses `git` instead of `gh`

## 0.2

-   Add: Empty Dark Theme

## 0.1

-   Add: Relative goto command
-   Add: Open Pull Request command in Source Control
