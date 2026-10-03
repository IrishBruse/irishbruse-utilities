---
name: verify-markdownInline
description: "Prove an Inline Markdown editor or playground change with the feature tests under src/markdownInline/tests. Use when verifying the editor, the playground, or a visual change, when running or debugging test:markdown-inline-browser, when a browser test hangs or fails, or when moving or renaming Inline Markdown modules."
---

# verify-markdownInline

The playground is `http://127.0.0.1:5175/`.
Dev server rules are in `src/markdownInline/playground/AGENTS.md`.

A source change is finished when both of these exit 0:

- `npm run test:markdown-inline` for the colocated unit tests
- `npm run check:markdown-inline` for the typecheck, then the browser tests

The browser command alone does not typecheck.
`npm test` does not open the playground.
When a change is imported from outside `src/markdownInline`, also run `npm test` and `npm run lint`.
The report names every red run and what turned it green.

## Feature folder

Each feature lives in `src/markdownInline/tests/<feature-name>/`.

| File | Role |
| --- | --- |
| `README.md` | What the feature does, in plain English. |
| `fixtures/` | The sample documents. The playground opens one as `?fixture=<feature-name>/fixtures/<path>`. |
| `integration.test.ts` | The feature working as a whole. |
| `regression.test.ts` | A bug that already happened. |
| `screenshots/` | The saved picture a visual check compares. |

Shared browser setup for those tests lives in `src/markdownInline/support/browser.ts`.
A new feature is finished when that folder exists and the finish commands above exit 0.
A numbered case may be `fixtures/case-N.md`.
A skill sample is `fixtures/<name>/SKILL.md`, and `<name>` is the `name` value in that file.

Manual documents that a person opens in VS Code stay in `docs/tests/markdown/`.

## Visual check

A paint or layout bug saves a picture from `#editor` beside the regression test.
The first run writes `screenshots/<name>.png` and exits non-zero.
Open that file and check the picture shows the page you just judged.
When it does not, delete it, fix the page or the clip, and write it again.
The next run compares that picture.
Done when the picture was opened and matches, and the compare exits 0.

## Playground is not the host

The playground serves source.
VS Code loads the built webview and sets theme variables on the document body, often as `rgba`.
A playground pass does not show those.
Rebuild before claiming the webview.
A claim about the VS Code editor, including which tab or diff it opens, is checked in VS Code or reported as unverified.

## Browser run hangs or fails

Read the thrown error, or the Vite overlay text, before guessing a cause.
Put the fix in the moved code or in `support/browser.ts`.
Do not change import style to work around a dev-server symptom.

## Editor misrenders

When the inline editor misrenders, check these before inventing a new cause.
A theme color paints pure red, or the highlight is the wrong color: the host color is not hex, or the variable lives on the body.
A rendered image, rule, or table vanishes: its view zone is tied to a hidden line.
The selection or current line sits under a decoration, or the decoration covers the glyphs: the overlay paint order is wrong.
The text and the selection disagree horizontally: a hidden marker was collapsed to zero width, so the words moved and the highlight stayed on the source columns.
