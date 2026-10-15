# Large Markdown performance profile

This profile is for `docs/tests/markdown/large/reltio-docs.md` in the playground.

Open [the large fixture](http://localhost:5175/?fixture=large%2Freltio-docs.md).

The capture date is 15 October 2026.

Chrome recorded the traces through `agent-browser` on Linux.

The playground on port 5175 was already running.

Vite served cached modules, so this profile is a warm load.

## Document

The model holds 13,888,980 characters.

The model holds 245,627 lines.

The browser received 14,305,391 bytes in 137 ms.

A read of the model string took 0.1 ms.

The string was already in memory.

## Large-document path

`fullPaintLineLimit` is 2,000 lines.

This file uses the large-document path.

That path sets Monaco wrap to `simple`.

The editor owns the scroll.

The scroll track is `.inline-md-screen-scroll`.

The track height is 20,000 px.

The scale for this file is 264.13.

One screen pixel maps to 264 editor pixels.

The viewport height was 538 px.

The DOM held about 34 `.view-line` nodes.

## Shell timing

The navigation finished in 386 ms.

Time to first byte was 3.6 ms.

`DOMContentLoaded` was 384 ms.

A later vitals read reported these shell marks:

- FCP is 40 ms.
- LCP is 200 ms.
- CLS is 0.

Those marks record the page shell.

The editor parse runs after those marks.

## Open

The open trace has 84,075 events.

One animation frame ran for 4,385 ms.

That frame is a call in `src/markdownInline/lib/editor.ts`.

CPU samples for the whole open window total 5,734 ms.

That window includes idle time and the unload of the previous page.

The editor frame itself is the 4,385 ms above.

| Area                 | Sample time | Share |
| -------------------- | ----------: | ----: |
| micromark            |    3,674 ms |   64% |
| runtime              |    1,155 ms |   20% |
| Monaco               |      482 ms |    8% |
| other dependencies   |      252 ms |    4% |
| `markdownInline/lib` |      170 ms |    3% |

The largest micromark functions are `go`, `consume`, and `subtokenize`.

`parseScopes` in `lib/document/scopes.ts` tokenizes the full text.

Main-thread garbage collection samples are 327 ms.

Monaco `createLineBreaks` samples are 256 ms.

That work builds line breaks for the full model.

Layout was 3.6 ms.

Style update was 10.6 ms.

Paint was 3.1 ms.

The stall is script time.

Heap with the model in memory was 225 MB used and 350 MB allocated.

A later read, after collection, showed 131 MB used.

## One character

The caret was at offset 2.

The key `Z` changed the prefix to `# ZReltio Documentation`.

One task ran for 4,446 ms.

micromark samples for that task are about 3,400 ms.

`markdownInline/lib` samples are 214 ms.

`cachedScopes` keeps the parse for one model version.

An edit changes the version, so the full text is parsed again.

Animation frames during that task stayed at 2.6 ms.

The stall is the parse task.

## Caret jump

`setCursor` to offset 6,944,490 took 166 ms.

`setCursor` to the last offset took 14 ms.

`setCursor` back to offset 0 took 45 ms.

The samples sit in `appendFormatted` in `lib/preview/blockZone.ts`.

That function builds the HTML for inline spans in a table cell.

The jump stays out of micromark.

## Scroll

Use `.inline-md-screen-scroll` for this document.

The Monaco scrollbar is hidden while the editor owns the scroll.

Ten scrolls of 500 px moved the track from 72 px to 5,072 px.

The visible text changed.

Frames in that burst were 0.4 ms to 1.7 ms.

Eight scrolls of 40 px, with a 120 ms pause, moved the track from 0 px to 320 px.

That trace has 39 animation frames.

The median frame is 0.7 ms.

The 95th percentile frame is 4.6 ms.

The longest frame is 7.5 ms.

Three tasks were longer than 50 ms.

Those tasks are 56 ms, 255 ms, and 80 ms.

The long task builds table HTML in `appendFormatted`.

Scroll samples stay out of micromark.

The paint window covers the visible lines plus 120 lines.

## What dominates

The full micromark parse dominates open and edit.

That parse is about 4.4 s for this file.

A scroll keeps the cached parse.

A table in the paint window can still add a task of about 255 ms.

## Repeat

Start the playground.

Open the fixture URL above.

Start `agent-browser profiler` before the action you want to measure.

Stop the profiler after that action.

Scroll `.inline-md-screen-scroll` when the file has more than 2,000 lines.
