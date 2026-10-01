# Rules

## Changelog

Keep `CHANGELOG.md` updated with each major feature change.
Always add to Unreleased section.

## Verify

When a change touches the Inline Markdown webview or playground, verify it with verify-markdownInline before finishing.
Follow `.cursor/skills/verify-markdownInline/SKILL.md`.
Call `npm run verify-markdownInline` for every run and every trace.
If the playground is already running, leave that server running.

When you finish a new Inline Markdown feature, update `.cursor/skills/verify-markdownInline/feature-map.md` with a map entry (Does, Reach, Activate, From).
Extend `src/markdownInline/playground/fixture.md` and `.cursor/skills/verify-markdownInline/cli/main.ts` evidence and discovery when the feature needs playground coverage.
Run `npm run verify-markdownInline -- map check` before finishing.
