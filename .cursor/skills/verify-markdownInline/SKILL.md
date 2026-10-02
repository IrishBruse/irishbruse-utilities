---
name: verify-markdownInline
description: Prove an Inline Markdown editor or playground change with the feature tests under src/markdownInline/tests. Use when verifying the editor, the playground, or a visual change.
---

# verify-markdownInline

The playground is `http://127.0.0.1:5175/`.
`npm run dev:markdown-inline` starts it when nothing is listening there.
When that URL is already up, leave the server running.

A change to the editor or playground is finished when `npm run test:markdown-inline-browser` exits 0.
That command is the run.
`npm test` does not open the playground.

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
A new feature is finished when that folder exists and the browser command exits 0.
A numbered case may be `fixtures/case-N.md`.
A skill sample is `fixtures/<name>/SKILL.md`, and `<name>` is the `name` value in that file.

Manual documents that a person opens in VS Code stay in `docs/tests/markdown/`.

## Visual check

A paint or layout bug saves a picture from `#editor` beside the regression test.
The first run writes `screenshots/<name>.png` and exits non-zero.
The next run compares that picture.
Done when the compare exits 0.

## Playground is not the host

The playground serves source.
VS Code loads the built webview and sets theme variables on the document body, often as `rgba`.
A playground pass does not show those.
Rebuild before claiming the webview.
A claim about the VS Code editor, including which tab or diff it opens, is checked in VS Code or reported as unverified.

## Editor misrenders

When the inline editor misrenders, check these before inventing a new cause.
A theme color paints pure red, or the highlight is the wrong color: the host color is not hex, or the variable lives on the body.
A rendered image, rule, or table vanishes: its view zone is tied to a hidden line.
The selection or current line sits under a decoration, or the decoration covers the glyphs: the overlay paint order is wrong.
The text and the selection disagree horizontally: a hidden marker was collapsed to zero width, so the words moved and the highlight stayed on the source columns.
