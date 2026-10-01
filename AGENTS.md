# Rules

## Changelog

Dont add to `CHANGELOG.md` every minor update.
Always add to Unreleased section when editing.

## Verify

When a change touches the Inline Markdown webview or playground, verify it with verify-markdownInline before finishing.
Follow `.cursor/skills/verify-markdownInline/SKILL.md`.
Call `npm run verify-markdownInline` for every run and every trace.
If the playground is already running, leave that server running.

When you finish a new Inline Markdown feature, update `.cursor/skills/verify-markdownInline/feature-map.md` with a map entry (Does, Reach, Activate, From) and add its evidence in the verify CLI.
Extend `src/markdownInline/playground/fixture.md` and discovery when the feature needs playground coverage.
Run `npm run verify-markdownInline -- validate` and `npm run verify-markdownInline -- regress` before finishing.
