# Rules

## Changelog

Dont add to `CHANGELOG.md` every minor update.
Always add to Unreleased section when editing.

## Verify

Inline Markdown package boundary: `src/markdownInline/AGENTS.md`.

When a change touches the Inline Markdown webview or playground, verify it with verify-markdownInline before finishing.
Follow `.cursor/skills/verify-markdownInline/SKILL.md`.
If the playground is already running, leave that server running.
A new test case follows `.cursor/skills/markdown-inline-case/SKILL.md`.
A new feature gets `src/markdownInline/tests/<feature-name>/` with `README.md`, `fixtures/`, `integration.test.ts`, and `regression.test.ts`.
A paint or layout bug also keeps its picture in that folder's `screenshots/`.
Finish with `npm run test:markdown-inline-browser` exiting 0.

## Regression

Bug fixes follow `.cursor/skills/regression/SKILL.md`.
Add the regression, confirm it fails on the current code, then fix, then confirm that same check passes.
