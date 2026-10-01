---
name: verify-markdownInline
description: Run the Inline Markdown playground, its regression suite, and map validation. Use when verifying a change, collecting a trace, or interpreting a screenshot or vague UI report.
---

# verify-markdownInline

Call `npm run verify-markdownInline` for every run, trace, regression, and validation.
A run is that CLI command.
A raw browser session does not count, even when its name is verify-markdownInline, and it writes no trace.
When the CLI cannot do the check, say so.
Read `feature-map.md` before choosing which feature a report means.
The trace command prints the trace path.

The app is the Inline Markdown playground at `http://127.0.0.1:5175/`.
`npm run dev:markdown-inline` is the start command when nothing is listening there.

## Commands

- `npm run verify-markdownInline -- up` starts the playground and waits until `http://127.0.0.1:5175/` returns HTTP 200.
  If that URL is already up, `up` leaves the existing server running.
- `npm run verify-markdownInline -- down` stops the process `up` started.
- `npm run verify-markdownInline -- open "<feature>"` reaches that feature map entry.
- `npm run verify-markdownInline -- trace "<feature>"` opens it, asserts that feature's evidence, writes a trace file, and prints its path.
- `npm run verify-markdownInline -- regress` runs validation, then asserts every feature's evidence. It prints each passing feature and, on failure, the feature name plus a text snapshot.
- `npm run verify-markdownInline -- validate` checks the map and the evidence without a browser. It exits non-zero and names each problem.
- `npm run verify-markdownInline -- map check` drives every Reach and Activate and exits non-zero when a locator fails, naming the feature.
- `npm run verify-markdownInline -- map refresh` rewrites Reach and Activate from the live app and leaves Does, From, and Sequence as written.

A one-line crop, "formatted markdown that starts with Hello", resolves to Rendered document.
The command is `npm run verify-markdownInline -- open "Rendered document"`.
A task checkbox, including one with a list bullet beside `- [ ]`, resolves to Task.
The command is `npm run verify-markdownInline -- open "Task"`.

## Regression

`regress` is the suite.
`map check` only proves a locator runs.
`trace` is one feature plus a profile.
A behavior change is finished when `regress` exits 0.
Evidence reads view text with non-breaking spaces folded into normal spaces, and a selector click waits until that element is inside the viewport.

## Validation

`validate` requires every map entry to have evidence, every evidence key to name a map entry, every From to resolve without a cycle, and every Activate to be a locator the runner can perform (`offset=`, `text=`, `alt=`, `role=`, or a CSS selector).
Run it when you add or rename a feature.
`regress` runs it first.
`Sequence: yes` means the evidence drives the gesture, so regression and trace skip that entry's Activate and still run its parent chain.

## Feature map

When a locator cannot hit rendered text, change that entry's Activate.
Prefer `window.__inlineMarkdown` and `?fixture=`.
Leave the product markup as the feature wrote it.
A checker or feature-map edit that changes whether a check passes is its own step, and it is reported to the user.

## Reports

A color or theme report starts from the VS Code user settings the playground theme loader already reads, and from a sample of the reference screenshot.
When a quoted setting does not name the thing in the complaint, measure the rendered pixel against the reference, or ask, before applying the number.

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
