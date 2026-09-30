---
name: verify-markdownInline
description: Run the Inline Markdown playground and collect traces, and resolve a UI report to a feature. Use when verifying a change, collecting a trace, or interpreting a screenshot or vague UI report.
---

# verify-markdownInline

Call `npm run verify-markdownInline` for every run and every trace.
Read `feature-map.md` before choosing which feature a report means.
The trace command prints the trace path.

The app is the Inline Markdown playground at `http://127.0.0.1:5175/`.
`npm run dev:markdown-inline` is the start command when nothing is listening there.

## Commands

- `npm run verify-markdownInline -- up` starts the playground and waits until `http://127.0.0.1:5175/` returns HTTP 200.
  If that URL is already up, `up` leaves the existing server running.
- `npm run verify-markdownInline -- down` stops the process `up` started.
- `npm run verify-markdownInline -- open "<feature>"` reaches that feature map entry.
- `npm run verify-markdownInline -- trace "<feature>"` opens it, writes a trace file, and prints its path.
- `npm run verify-markdownInline -- map check` drives every entry and exits non-zero when a Reach or Activate fails, naming the feature.
- `npm run verify-markdownInline -- map refresh` rewrites Reach and Activate from the live app and leaves Does and From as written.

A one-line crop, "formatted markdown that starts with Hello", resolves to Rendered document.
The command is `npm run verify-markdownInline -- open "Rendered document"`.
