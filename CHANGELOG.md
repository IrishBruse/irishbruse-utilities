# Changelog

## Unreleased

-   Add: Mermaid preview opens GBL call-graph `click … href` links at the source location
-   Add: Mermaid preview supports `bindFunctions`, Gantt clicks, external URLs, modifier-click to open beside, and basename path fallback for co-located call graphs
-   Change: Mermaid preview is optional (`Open Preview`); `.mmd` diffs and normal opens use raw source text
-   Fix: Mermaid diagram node clicks resolve targets from source `click` lines when SVG uses placeholder links
-   Fix: Mermaid diagram titles and cluster labels use editor foreground instead of default gold styling
-   Change: Mermaid preview shows custom link hover labels instead of native browser `title` tooltips
-   Add: Mermaid link targets accept `path:line:column` hrefs and VS Code `#Lline,column` fragments (in addition to GitHub `#Lline`)
-   Change: GBL `path:line:column` is canonical for click href/tooltip; maps and openLink normalize legacy `#L` hrefs
-   Fix: Mermaid preview links work for co-located files like `test.txt:1:1` (hit-testing, case-insensitive node ids, linked-node styling)
-   Fix: GBL `path:line` / `path:line:column` in Mermaid `href` no longer breaks clicks (path-only link + strip colon hrefs from SVG anchors)
-   Fix: Mermaid preview link clicks use global hit-testing so pan/zoom does not swallow `test.txt:3:2` node presses
-   Fix: GBL paths normalize `./test.txt` vs `test.txt`; linked nodes get direct click handlers after render
-   Fix: Mermaid 11 flowchart node DOM ids (`my-svg-flowchart-Other-3`) map to click targets so `test.txt:line:col` nodes open
-   Fix: Do not hoist flowchart nodes out of Mermaid's positioning `<a transform>` wrappers (broke layout)

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
