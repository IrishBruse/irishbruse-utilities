---
name: new-test-markdown-inline
description: Walk through a new Inline Markdown test case by asking for the scenario, then checking it in the playground. Use when adding a feature test, a sample, a scenario, or a regression under src/markdownInline/tests.
---

# markdown-inline-case

The folder shape and the finish command are in `.cursor/skills/verify-markdownInline/SKILL.md`.
A bug still goes red before the product changes, as in `.cursor/skills/regression/SKILL.md`.

Ask one question, then wait for the answer.
Write nothing until the sample is accepted.

## Questions

1. Which feature is this, and does `src/markdownInline/tests/<feature-name>/` already exist?
   Done when the folder name is known.

2. What is the scenario?
   Ask what a person should see, and what would be wrong.
   Done when that can be said in plain English.

3. Is this the feature working as usual, a bug that already happened, or both?
   Ask whether the failure is something you see (spacing, color, clipping, a missing mark) or something the text and controls do.
   Done when `integration.test.ts`, `regression.test.ts`, or both are chosen, and whether a picture is required.

4. Show a draft of `test-N.md` from their words.
   Use the next number in that folder.
   Done when they accept the sample.

## Write

Add the accepted sentences to `README.md`.
Save the sample as `test-N.md`.
Point `integration.test.ts` at the whole scenario.
Point `regression.test.ts` at the bug, and leave production code unchanged until that file fails.
A visible failure also gets a picture under `screenshots/`, taken only after the page looks right.

## Explore

Open `http://127.0.0.1:5175/?fixture=<feature-name>/test-N.md`.
`npm run dev:markdown-inline` starts the playground when nothing is listening.
When it is already up, leave that server running.

Check every sentence in the README against the rendered page.
A mark that should be seen is the thing under the pointer, not only a node in the page.
Words that should line up with a mark share an edge with it.
Text that should stay visible is still in the editor text.
A picture matches the page you just checked.

## Verify

Run the new test file:

```bash
npm run test:markdown-inline-browser -- src/markdownInline/tests/<feature-name>/<file>.test.ts
```

Then run `npm run test:markdown-inline-browser`.
Done when that command exits 0, the README matches the page, and a visual case has its saved picture.
