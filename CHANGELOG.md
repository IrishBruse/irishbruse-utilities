# Changelog

## 0.10.0

-   Add: Mermaid preview custom editor for `.mmd` and `.mermaid` files
-   Add: Live diagram rendering with VS Code theme integration
-   Add: Zoom, pan, fit-to-view, and copy diagram as PNG
-   Add: Open Preview / Open Source commands in the editor title bar
-   Add: Action Panel activity bar view with configurable actions, agent prompts, and VS Code commands
-   Add: Git Helpers panel in Source Control with hardcoded diff and review actions
-   Add: Gutter comment buttons on base branch diff lines for review notes
-   Fix: Saved review notes now appear in the diff after submitting from the gutter
-   Change: Review notes are single editable comments per line (no reply thread UI)
-   Change: Review notes open in a polished side panel editor instead of the inline comment widget
-   Fix: Open PR falls back to GitHub repo when no PR exists, gh is missing, or origin uses SSH
-   Fix: Action editor icon preview now matches the highlighted icon in the searchable picker
-   Fix: Update bundled codicons so icons like `git-pull-request-create` render distinctly from `git-pull-request`
-   Add: Git Helpers base branch picker — choose `develop`, a release branch, or a commit as the diff target

## 0.3

-   Add: Snippet View
-   Fix: Open PR use `git` instead of `gh`

## 0.2

-   Add: Empty Dark Theme

## 0.1

Initial Release

-   Add: Open PR button
-   Add: Relative goto Command
