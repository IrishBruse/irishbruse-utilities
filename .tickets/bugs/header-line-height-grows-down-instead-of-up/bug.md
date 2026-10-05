---
type: bug
title: Headers grow line height downward instead of upward to fit header text
created: 2026-10-05
source: both
---

# Headers grow line height downward instead of upward to fit header text

## Description
For rendered headers, extra line height is added below the header text rather than above it, so the line does not properly match the visual size of the header.

## Steps
1. Open a document that shows a large orange title line (e.g. “Better syntax highlight for common languages”) and a pink section header “Description” with body text below, as in the screenshot (lines 8–13).

## Expected
Line height for headers should increase upward to match the size of the header text properly, not primarily downward.

## Actual
Header lines use enlarged line height that extends downward, leaving awkward vertical spacing under headers such as “Description” before the following body line.

## Evidence
- User: “headers instead of increasing the line height down it should increase it up to match the size of the header text properly”
- Image: line 8 shows large orange title “Better syntax highlight for common languages”; line 10 shows pink “Description”; line 11 repeats that title in smaller grey text; line numbers 8 and 10 align with the bottom of the large header glyphs; visible gap below the “Description” header before line 11.

## Images
- ![](./image-1.jpg)
