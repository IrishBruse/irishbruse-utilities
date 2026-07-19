# Changelog

## 0.10.0

-   Add: Mermaid preview custom editor for `.mmd` and `.mermaid` files
-   Add: Live diagram rendering with VS Code theme integration
-   Add: Zoom, pan, fit-to-view, and copy diagram as PNG
-   Add: Open Preview / Open Source commands in the editor title bar
-   Add: Action Panel activity bar view with configurable actions, agent prompts, and VS Code commands
-   Add: Git Helpers panel in Source Control with hardcoded diff and review actions
-   Add: Open PR for the current branch shown in Git Helpers panel header and as a clickable row
-   Add: Open PR button in the Source Control title bar beside Collapse All Repositories when the current branch has an open PR
-   Fix: Source Control Open PR visibility uses URI-based context keys compatible with scm/repository matching
-   Add: Gutter comment buttons on base branch diff lines for review notes
-   Fix: Saved review notes now appear in the diff after submitting from the gutter
-   Change: Review notes are single editable comments per line (no reply thread UI)
-   Change: Review notes open in a polished side panel editor instead of the inline comment widget
-   Fix: Open PR falls back to GitHub repo when no PR exists, gh is missing, or origin uses SSH
-   Fix: Action editor icon preview now matches the highlighted icon in the searchable picker
-   Fix: Update bundled codicons so icons like `git-pull-request-create` render distinctly from `git-pull-request`
-   Add: Git Helpers base branch picker — choose `develop`, a release branch, or a commit as the diff target
-   Fix: Action Panel icons like `git-pull-request-create` now render correctly in the sidebar and icon picker
-   Fix: Action Panel sidebar icons now use theme-aware light/dark SVG colors instead of black
-   Fix: Restore Action Panel editor icon picker to CSS codicons after sidebar SVG change broke the webview
-   Fix: Review notes on the right side of branch diffs (working-tree files) can be added from the gutter again
-   Fix: Git Helpers panel now refreshes when git state changes, including branch checkouts

## 0.3

-   Add: Snippet View
-   Fix: Open PR use `git` instead of `gh`

## 0.2

-   Add: Empty Dark Theme

## 0.1

Initial Release

-   Add: Open PR button
-   Add: Relative goto Command
