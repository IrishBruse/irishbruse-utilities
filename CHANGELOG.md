# Changelog

## Unreleased

-   **Change**: Inline Markdown list gaps, bullet indent, and the list line-height variable come from the list module.

-   **Change**: Inline Markdown keeps reveal, selection stretch, and block view zones behind their own modules.

-   **Fix**: Inline Markdown focuses the first line when a new empty `.md` file opens so typing can start without an extra click.

-   **Fix**: Inline Markdown draws a previewed horizontal rule as one normal line, and drops the blank lines that were leaving a gap around it.

-   **Fix**: Inline Markdown opens a previewed horizontal rule for editing when that line is clicked.

-   **Change**: Remove the `generators/` package and `generate:contributes` scripts; maintain `src/constants.ts` by hand.

-   **Fix**: Inline Markdown paints a continuous selection highlight on task list lines by dropping the extra checkbox spacer and using the list gutter bullet.

-   **Fix**: Inline Markdown paints a continuous selection highlight on task list lines by dropping the extra checkbox spacer and using the list gutter bullet.

-   **Fix**: Inline Markdown updates inline marks while the mouse is held during a drag selection, not only after release.

-   **Fix**: Inline Markdown reveals list and task markers when a multi-line selection crosses their line, so the selection highlight stays continuous.

-   **Fix**: Inline Markdown sizes an image view zone from the picture so a missing image below it does not paint on the picture.

-   **Fix**: Inline Markdown skill front matter uses the code block background and a yaml label.

-   **Fix**: Inline Markdown keeps a table rendered when the caret is on the heading above the blank line before it.

-   **Fix**: Inline Markdown selection highlight stays on body lines when a heading in the same selection is stretched over its descenders.

-   **Change**: Inline Markdown playground fixtures live only under `docs/tests/markdown/`; default verify regression uses `playground.md`.

-   **Fix**: Inline Markdown indents gutter bullets for nested unordered list items.

-   **Fix**: Inline Markdown list and task item text align with bullets and checkboxes again after zero-width hidden markers.

-   **Change**: Inline Markdown skill front matter stays as raw YAML only; the Properties form and fence chrome are removed.

-   **Fix**: Inline Markdown stays on the text editor for git, diff, and merge opens.
A normal file view is the only place it renders.

-   Change: Ban comments in TypeScript and JavaScript via ESLint and remove existing comments from source.

-   **Fix**: Inline Markdown find uses VS Code theme tokens in the webview and matches the workbench find bar styling.
-   **Fix**: Inline Markdown find in VS Code copies the host theme onto the editor so the find bar uses those colors.
-   **Fix**: Inline Markdown find stays fixed to the editor viewport while scrolling, without following the scroll a frame late.
-   **Fix**: Inline Markdown drops the centered column's side padding once the window is too narrow to keep it.
-   **Fix**: Inline Markdown heading lines keep the heading font size and add a little space above and below.
-   **Fix**: Inline Markdown heading selection extends down to cover the descenders.
-   **Fix**: Inline Markdown playground ships `vscode-iframe-injected-theme.css` (VS Code webview iframe tokens) plus settings overrides from `settings.json`.
-   **Fix**: Inline Markdown task checkboxes match settings controls: checkbox tokens when unchecked, button tokens and a CSS checkmark when checked.
-   **Fix**: Inline Markdown task checkboxes and code-block hits sit on their lines in the centered column instead of hugging the viewport edge.
-   **Fix**: Inline Markdown reveals image and table source from a click or the line above, shows markers inside a drag selection, and paints Mermaid again after leaving raw source.
-   **Fix**: Inline Markdown Open Preview is a green underlined link, wrapped list lines hang-indent, and the column stays centered while wide content can scroll.
-   **Fix**: Inline Markdown mouse drag keeps extending across rules, images, and tables, and the selection highlight paints above line backgrounds.
-   **Fix**: Inline Markdown list bullets stay in the text line instead of sitting under the line numbers.

## 0.23.1

-   **Fix**: Inline Markdown resets VS Code webview body padding so the editor and vertical scrollbar align with the tab edge; horizontal scroll is suppressed without clipping wrapped lines

## 0.23.0

-   **Add**: **Inline Markdown (ib-utilities)** custom editor for `.md` files: formatted preview with raw syntax on focus, line numbers, images, task checkboxes, and fenced-code highlighting in the normal editor (not diffs or git views).
-   **Add**: GFM table grid preview, idle mermaid diagrams with **Open Preview** CodeLens, and YAML front matter highlighting with a SKILL.md Properties card and property autocomplete.
-   **Fix**: Theme-aligned current line, selection, blockquotes, headings, links, code blocks, scrollbars, and table or mermaid editing behavior in Inline Markdown.
-   **Remove**: Changed Files sidebar and Action Panel.

## 0.22.0

-   Change: Sync Markdown Editor with `@vscode/markdown-editor` 0.0.2-110
-   Add: `SKILL.md` YAML front matter as a Properties card with typed fields and key autocomplete
-   Add: Large Markdown files mount only visible blocks and paint a prefix first so open and scroll stay fast
-   Add: Confluence-style table grid, sanitized HTML preview, and themed Mermaid **Open Preview** on the 110 webview
-   Fix: Selected leading spaces and trailing EOL spaces show as `·`; empty areas and Mermaid enter edit on click; link definitions and broken images no longer look like errors
-   Change: Markdown Editor is only used when directly editing a file, not in diffs
-   Change: Markdown Editor opens editable by default (the lock still persists after you toggle it)

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
