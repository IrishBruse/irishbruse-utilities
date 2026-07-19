# Changelog

## 0.10.0

-   Change: Snippet JSON loading uses native `fs` and `JSON.parse` instead of the `cjson` dependency
-   Change: Updated dev and runtime dependencies
-   Change: Replaced `tsx` with native Node 24 TypeScript execution for contributes generation
-   Add: Mermaid preview custom editor for `.mmd` and `.mermaid` files
-   Add: Live diagram rendering with VS Code theme integration
-   Add: Zoom, pan, fit-to-view, and copy diagram as PNG
-   Add: Open Preview / Open Source commands in the editor title bar
-   Add: Action Panel agent prompts support ${file} and ${selection} from the active editor
-   Add: Git Helpers panel in Source Control with hardcoded diff and review actions
-   Add: Open PR for the current branch as a clickable row in Git Helpers
-   Fix: Git Helpers panel keeps stable tree rows while refreshing instead of flickering between states
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
-   Add: Git Helpers shows Create draft PR when none exists and creates a blank draft via `gh`
-   Fix: Create draft PR pushes the branch with `git` before `gh pr create` (`gh` has no `--push` flag)
-   Add: Create draft PR row shows a spinner and is disabled while the PR is being created
-   Fix: Git Helpers only treats open pull requests as the branch PR (closed/merged PRs are ignored)
-   Change: Action Panel add/edit/delete now saves to user `settings.json` instead of workspace `.vscode/settings.json`
-   Fix: Action Panel refreshes when `ib-utilities.actionPanel.actions` is edited in settings, and migrates legacy workspace overrides
-   Fix: Action Panel reads user `settings.json` as source of truth instead of stale workspace overrides
-   Change: Remove Create PR and Update PR templates from the Action Panel add editor
-   Add: Git Helpers draft PR rows show a checkmark button to mark the PR ready for review
-   Add: Git Helpers PR rows show a copy button for the GitHub PR URL
-   Add: Git Helpers shows Open failed job log when PR checks are failing
-   Add: Git Helpers shows files changed with line stats; click opens the PR Changes tab on GitHub
-   Add: Git Helpers shows one PR review row for replies, changes requested, unresolved threads, or awaiting reviewers
-   Add: Git Helpers title bar refresh button beside Open PR
-   Fix: Git Helpers shows a loading row immediately when switching repositories or using refresh so stale actions cannot be clicked

## 0.3

-   Add: Snippet View
-   Fix: Open PR use `git` instead of `gh`

## 0.2

-   Add: Empty Dark Theme

## 0.1

Initial Release

-   Add: Open PR button
-   Add: Relative goto Command
