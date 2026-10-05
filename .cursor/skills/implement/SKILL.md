---
name: implement
description: "Implements one change from the chat, a .tickets bug or todo, or a src/markdownInline/tests feature README. Use when the user says implement, names a .tickets file, or points at a feature test folder to build. Before the first edit, state the Change line and the Hold line, then continue."
---

# Implement

One run builds one source.

## Source

| The message names | Source |
| --- | --- |
| A path under `.tickets/bugs/` or `.tickets/todos/`, or a title that matches one ticket folder | That folder's `bug.md` or `todo.md`. Read it and every linked image. |
| `src/markdownInline/tests/<feature>/` | That folder's `README.md`. |
| Anything else | The message, including its images. |

A follow-up image of the same interaction stays on this source.

**Done when:** the source is named, and every image it links has been read.

## Do

Editor behavior: write the Change sentence and the Hold sentence from `.cursor/skills/markdown-inline/SKILL.md` before the first edit, then continue in that same turn. Hold uses only behavior the source states.

A bug ticket, or a source that states a wrong result, follows `.cursor/skills/regression/SKILL.md`.

A todo ticket, a feature README, or new Inline Markdown behavior follows `.cursor/skills/new-test-markdown-inline/SKILL.md`. That ticket or README is the named scenario, so write the check from it in this turn.

Work outside `src/markdownInline` gets one failing check beside the module before production code changes, then the tests that cover that module.

**Done when:** the check for this source exists and, for a wrong result, that check has gone red before production code changes.

## Done

Playground server rules are in `src/markdownInline/playground/AGENTS.md`.

A ticket is finished when every Done when line other than `Not in the source` is true. When every Done when line is `Not in the source`, a bug is finished at its Expected section and a todo is finished at the outcome in its Description.

A feature README is finished when each of its sentences is true.

The reply names the source, the red command, and the green command.

**Done when:** those commands exit 0 and the reply names them.
