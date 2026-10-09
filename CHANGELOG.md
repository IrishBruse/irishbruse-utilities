# Changelog

## Unreleased

## 0.27.0

-   **Remove**: The legacy Markdown Editor; `.md` files use Inline Markdown only.
-   **Fix**: Inline Markdown keeps scroll position when the file changes on disk.
-   **Fix**: A click below the last line places the caret at the end of that line.
-   **Fix**: The table grid stays aligned with the pipe-table source lines.
-   **Fix**: Mermaid preview lines up with the fenced code block; **Open Preview** sits above the diagram.
-   **Fix**: Wrapped blockquote lines indent with the opening quote marks.
-   **Add**: `SKILL.md` front matter shows Agent Skills spec errors and autocompletes the supported fields.
-   **Change**: Skill front matter validation and autocomplete apply only to `SKILL.md`.

## 0.26.0

-   **Fix**: Extension keyboard shortcuts bind to the intended commands.
-   **Remove**: Jira row and workflow from Git Helpers.
-   **Add**: Git Helpers keeps per-repository panel data in cache when you switch repos.

## 0.25.1

-   **Change**: The extension package includes only the files the editor loads.

## 0.25.0

-   **Fix**: Inline Markdown selection stays on the source. Front matter highlights the raw YAML and includes the newline after the line. List gaps join the highlight between items, and the extra selection corner no longer shows.
-   **Fix**: Headings use the heading scale for font size and line height, so the extra space sits above the heading.
-   **Fix**: An ordered-list marker inside a fenced code block stays literal text.
-   **Fix**: Visible Markdown links use the editor theme colors.
-   **Fix**: The Localhost panel opens wildcard and loopback addresses as `http://localhost:<port>`.

## 0.24.0

-   **Add**: **Localhost** panel lists local websites, opens one in the browser, and can stop the process on that port.
-   **Fix**: Inline Markdown keeps the selection highlight continuous across lists, tasks, headings, rules, images, and tables, including while the mouse is still dragging.
-   **Fix**: List bullets sit in the gutter with nested indent, wrapped lines align with the item text, and task labels clear the checkbox.
-   **Fix**: Images stay previewed until the caret is on that line, tables stay rendered from the heading above them, and a horizontal rule draws as one line that opens on click. Arrow keys land on hidden preview lines.
-   **Fix**: The find bar uses the workbench theme and stays fixed while scrolling. Headings keep their size with space around them, and a new empty file focuses the first line.
-   **Change**: Inline Markdown shows `SKILL.md` front matter as highlighted YAML. Git, diff, and merge views keep the stock text editor.
-   **Change**: Fenced-code language labels use syntax colors, and blockquotes paint on the editor background.

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
