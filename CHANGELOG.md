# Changelog

## Unreleased

-   Fix: Markdown Editor shows raw `1.` list numbers in preview and while you edit, in the text flow
-   Fix: Markdown Editor keeps inline code, bold, italic, strike, and link colors on the markers while you edit
-   Fix: Markdown Editor paints a dark edit panel behind a list or paragraph without shifting the text
-   Fix: Markdown Editor selects a word on double-click when `preventDefault` on pointer down hides `event.detail`
-   Fix: Markdown Editor extends a double-click word selection (and a triple-click line selection) while you drag
-   Add: Markdown Editor wraps the selection with `**` (Ctrl/Cmd+B), `*` (Ctrl/Cmd+I), and `` ` `` (type or Ctrl/Cmd+`)
-   Fix: Markdown Editor paints space and tab `·` / `⇥` marks over the real character so selection width does not jump
-   Fix: Markdown Editor places the caret in paragraph text on click
-   Fix: Markdown Editor places the caret in heading text on click, not in the `#` prefix
-   Fix: Markdown Editor keeps heading size when you click from one heading to another
-   Fix: Markdown Editor keeps heading text aligned when the dark edit panel shows
-   Fix: Markdown Editor does not indent heading text relative to the body
-   Fix: Markdown Editor keeps the scroll position when the caret is restored
-   Fix: Markdown Editor keeps heading `#` markers next to the edit panel so they are not clipped
-   Fix: Markdown Editor paints heading `#` markers outside the dark edit panel
-   Fix: Markdown Editor keeps heading text in place when `#` markers show in edit mode
-   Fix: Markdown Editor paints again after a missing heading type stopped the render
-   Change: Markdown Editor keeps heading size and color, and inline styles, while you edit a block
-   Fix: Markdown Editor keeps block size when you click to edit (no layout jump)
-   Change: Markdown Editor paints the focused edit block as a darker rounded panel
-   Fix: Markdown Editor types into the focused block; active lists no longer double the gap between lines
-   Change: Parse Markdown with `marked` (GFM) instead of the in-repo line scanner
-   Fix: Markdown Editor can edit again after **Unlock**; clicks on idle text set the caret
-   Change: Parse Markdown in the editor with no remark / micromark / mdast packages
-   Change: Replace `@vscode/markdown-editor` with an in-repo Markdown editor (no VS Code first-party editor packages)
-   Remove: Markdown Editor comments, iframe code-block editors, rich-link cards, and `sync-markdown-editor` VS Code checkout copy
-   Add: Markdown Editor paints `SKILL.md` YAML front matter as a Properties card with typed fields and Add property key autocomplete
-   Change: SKILL.md Properties card is full content width with a transparent fill and a border only
-   Change: SKILL.md Properties rows no longer show a type icon before the key
-   Change: SKILL.md boolean fields use the same quiet field chrome as the text inputs
-   Fix: SKILL.md Properties text fields show a caret (the document editor hides the native caret)
-   Fix: Markdown Editor shows selected leading spaces as `·`, like the VS Code text editor
-   Fix: Markdown Editor keeps `·` on trailing spaces after glue rebuilds and on idle hard breaks
-   Add: Markdown Editor mounts only the visible blocks of large files, so open and scroll stay fast
-   Add: `npm run fetch-markdown-large-fixtures` — downloads large real-world Markdown stress tests (Reltio corpus, awesome-selfhosted, MDN, etc.) into `docs/tests/markdown/large/`
-   Add: Expanded Markdown Editor manual test fixtures under `docs/tests/markdown/` (README, keyboard-whitespace, lists-tasks, links-autolinks)
-   Fix: Markdown Editor shows angle-bracket autolinks and HTML it cannot paint as raw source
-   Change: Group markdown editor code under `src/markdownEditor/` (`host/`, `webview/`); replace webview `@vscode/observables` usage with local helpers
-   Add: **Discard** editor title bar action when the file on disk changed and the editor text is different; reloads from disk and keeps the file open
-   Add: Editor title bar icons to swap between the Markdown text editor and Markdown Editor (ib-utilities) for the same `.md` file
-   Fix: Markdown Editor Enter starts a new paragraph or continues a list; Shift+Enter inserts a hard line break (two trailing spaces)
-   Fix: Markdown Editor shows `·` for trailing spaces at the end of the last paragraph
-   Add: Markdown Editor supports Shift+click, click-drag, and Select All for text selection
-   Add: Markdown Editor selects a word on double-click and a line on triple-click
-   Fix: Markdown Editor copy, cut, and paste use the current selection; the edit model no longer kept selection collapsed
-   Fix: Markdown Editor paste skips clipboard payloads with no `text/plain` (no empty insert)
-   Fix: Markdown Editor copy does not fall back to rich HTML when the model selection is empty but the DOM still shows a range
-   Fix: Markdown Editor read-only mode still supports pointer selection and copy; cut and paste stay disabled

## 0.21.0

-   Fix: Markdown Editor task checkboxes keep `[ ]` / `[x]` on one line
-   Fix: Markdown Editor shows `·` only for trailing spaces, including at the end of a block
-   Fix: Markdown Editor caret stays visible at the end of a block
-   Fix: Markdown Editor list markers no longer use the H2 heading color
-   Fix: Markdown Editor empty areas, Mermaid diagrams, and padding enter edit mode on click
-   Fix: Markdown Editor showcase image placeholder size
-   Fix: Markdown Editor table columns wrap long cells first; layout stays put when you click a cell

## 0.20.0

-   Add: **Open Preview** button on Mermaid fences in the Markdown Editor
-   Fix: Markdown Editor Mermaid diagrams follow the workbench theme; Open Preview no longer overlaps the language badge
-   Fix: Markdown Editor fenced code blocks use plain editor text color instead of yellow
-   Fix: Markdown Editor tables wrap wide cells without equal-width columns or a horizontal scrollbar; table links open on click
-   Fix: Markdown Editor HTML `<details>` toggles on one click; stripped dangerous HTML keeps the orange outline; broken images show alt text; link definitions no longer look like errors
-   Change: Sync Markdown Editor with VS Code main (`@vscode/markdown-editor` 0.0.2-87)

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
