---
name: markdown-inline-case
description: "New Inline Markdown case. Use when adding a test case under src/markdownInline/tests."
---

# markdown-inline-case

One case lives in `src/markdownInline/tests/<feature-name>/`.

Before the first edit, write the Change sentence and the Hold sentence from `.cursor/skills/markdown-inline/SKILL.md` in the reply, then continue in that same turn.

When the user already named the feature, the steps, and the result, that scenario is the accepted sample.
Write it in that same turn.
A wrong result follows `.cursor/skills/regression/SKILL.md`.
The first edit is the check file.
Monaco reads and screenshot pixel scans come after that file exists.

## Questions

Ask one question, then wait.
The first write is the accepted sample.

1. Which feature is this, and does `src/markdownInline/tests/<feature-name>/` already exist?
   Done when the folder name is known.

2. What should a person see, and what would be wrong?
   Done when that can be said in plain English.

3. Is this the feature working as usual, a bug that already happened, or both?
   A visible failure (spacing, color, clipping, a missing mark) needs a picture.
   Done when `integration.test.ts`, `regression.test.ts`, or both are chosen, and the picture choice is made.

4. Show a draft of the sample.
   A numbered case is the next `fixtures/case-N.md`.
   A skill sample is `fixtures/<name>/SKILL.md`, and `<name>` is the `name` value in that file.
   Done when they accept the sample.

## Write

Add the accepted sentences to `README.md`.
Save the accepted sample under `fixtures/`.
Point `integration.test.ts` at the whole scenario.
Point `regression.test.ts` at the bug.
The regression file fails before any production edit.
Take a picture for a visible failure only after the page matches the README.
Save it under `screenshots/`.
Clip it to the marks, the words, and the line numbers that prove the case.
Done when the README, the sample, and the chosen test file exist.

## Explore

Open `http://127.0.0.1:5175/?fixture=<feature-name>/fixtures/<path>`.
`npm run dev:markdown-inline` starts the playground when nothing is listening.
When it is already up, leave that server running.

Check every sentence in the README against the rendered page.
A mark that should be seen is the thing under the pointer.
Words that should line up with a mark share an edge with it.
Text that should stay visible is still in the editor text.
After a run writes a picture under `screenshots/`, open that file and check it shows the page you just judged.
Done when every README sentence matches the page, and each saved picture was opened and matches that page.

## Verify

Run the new test file:

```bash
npm run test:markdown-inline-browser -- src/markdownInline/tests/<feature-name>/<file>.test.ts
```

Then run `npm run test:markdown-inline-browser`.
Done when that command exits 0.
