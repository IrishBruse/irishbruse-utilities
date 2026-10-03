---
name: regression
description: "Locks a reported bug behind a failing regression before the fix, then reruns that same check until it passes. Use when fixing a bug or adding a regression test."
---

# Regression

A bug fix is finished only after the same check goes red on the current code and green after the fix.

Leave production code unchanged until red is recorded.
Quote the red failure to the user before editing production code.

## Red

Write one check that asserts the correct behavior.

A keyboard skip is a key press. Place the caret on the line beside the hidden line, press ArrowUp or ArrowDown, and assert the caret is on that hidden line and its source is shown.
`setCursor` onto the hidden line does not show the skip.
Read the caret and the view on the next frame after the key.
Tests that share one page put the caret back on the preview position before a later check that needs the preview.

A reveal that opens the wrong block is a unit test beside `src/markdownInline/src/visibility.ts` when `markerVisibility` can return the wrong surface.
The playground picture is the report of that bug. The unit test is the check.

When the bug is visible in the Inline Markdown editor or playground, add it to that feature's folder.
Follow `.cursor/skills/new-test-markdown-inline/SKILL.md` only while the scenario is still open.
Follow `.cursor/skills/verify-markdownInline/SKILL.md` for the folder, the picture, and the finish command.
When the user already named the feature, the steps, and the wrong result, write the check.
The check is `src/markdownInline/tests/<feature-name>/regression.test.ts`.
The sample goes in that folder's `fixtures/`.
A numbered case may be the next `case-N.md`.
A skill sample is `<name>/SKILL.md`, and the folder name is the `name` value.
A paint or layout bug also saves a picture under `screenshots/`.
Open that picture and check it before the compare counts.

Run only that file:

```bash
npm run test:markdown-inline-browser -- src/markdownInline/tests/<feature-name>/regression.test.ts
```

When a unit test can see the bug, put the check in the existing `*.test.ts` beside the module.
Run only that test:

```bash
npm test -- path/to/file.test.ts -t "test name"
```

Red means that command exits non-zero because the new assertion failed, or because the behavior under test threw, and the test file itself loaded.
A load error means the test is unfinished: repair the test and rerun this step.
A command that already exits 0 means the check does not catch the bug: tighten the assertion and rerun until it goes red.
When the reported bug cannot be reproduced, stop and say so.

## Green

Change production code.
Rerun the same command from Red.
Green means that command exits 0.

Then run the wider suite for the area you changed.
`npm test` covers the repo unit tests.
An Inline Markdown editor or playground change also finishes with `npm run test:markdown-inline-browser` exiting 0.

## Report

Name the red command and the assertion or error that failed.
Name the green command and that it exited 0.
