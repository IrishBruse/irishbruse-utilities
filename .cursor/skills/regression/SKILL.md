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

Prefer a vitest test beside the module, in the existing `*.test.ts` style.
Run only that test:

```bash
npm test -- path/to/file.test.ts -t "test name"
```

Red means that command exits non-zero because the new assertion failed, or because the behavior under test threw, and the test file itself loaded.
A load error means the test is unfinished: repair the test and rerun this step.
A command that already exits 0 means the check does not catch the bug: tighten the assertion and rerun until it goes red.
When the reported bug cannot be reproduced, stop and say so.

When the failure is only visible in the Inline Markdown webview or playground, the check is verify-markdownInline evidence.
Follow `.cursor/skills/verify-markdownInline/SKILL.md`.
Red is `npm run verify-markdownInline -- trace "<feature>"` exiting non-zero on that evidence before the fix.

## Green

Change production code.
Rerun the same command from Red.
Green means that command exits 0.

Then run the wider suite for the area you changed.
`npm test` covers the repo.
`npm run test:markdown-inline` covers `src/markdownInline`.
A webview or playground change also finishes with `npm run verify-markdownInline -- regress` exiting 0.

## Report

Name the red command and the assertion or error that failed.
Name the green command and that it exited 0.
