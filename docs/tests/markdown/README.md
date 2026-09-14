# Markdown Editor manual test fixtures

Sample `.md` files for hands-on checks of **Markdown Editor (ib-utilities)**. Open any file in this folder, then use **Reopen Editor With... → Markdown Editor (ib-utilities)** (or the editor title bar swap icon when the file is already open).

For Mermaid-only samples see [../mermaid/](../mermaid/).

## Suggested order

1. [showcase.md](./showcase.md) — broad feature tour (headings, tables, code, mermaid, HTML, math, links).
2. [table-columns.md](./table-columns.md) — table wrap and short-column layout.
3. [lists-tasks.md](./lists-tasks.md) — list markers, nesting, task checkboxes.
4. [keyboard-whitespace.md](./keyboard-whitespace.md) — Enter, Shift+Enter, trailing-space dots.
5. [links-autolinks.md](./links-autolinks.md) — inline links, autolinks, reference definitions.
6. [edge-cases.md](./edge-cases.md) — odd syntax, sanitizer, sparse tables.
7. [blank.md](./blank.md) — empty document and click-to-edit baseline.
8. [large/](./large/) — downloaded real-world stress tests (14 MB docs, huge tables, 128k-line README).

## Large fixtures (online sources)

Run `npm run fetch-markdown-large-fixtures` to download into [large/](./large/). See [large/README.md](./large/README.md) for sources and sizes. Highlights:

- **reltio-docs.md** (~14 MB) — enterprise documentation corpus
- **awesome-selfhosted.md** (~320 KB) — massive linked tables
- **cirosantilli-readme-large.md** (~1 MB, ~128k lines) — GitHub render-limit line stress

## File index

| File | What to verify |
| :--- | :--- |
| [showcase.md](./showcase.md) | YAML front matter, theme colors, grid tables, code language badges, mermaid preview, HTML sanitization, images, math |
| [table-columns.md](./table-columns.md) | Short columns stay one word wide; long `Notes` / `Description` columns wrap first |
| [lists-tasks.md](./lists-tasks.md) | List marker color, Enter continues lists, task `[ ]` / `[x]` toggles on one line |
| [keyboard-whitespace.md](./keyboard-whitespace.md) | Enter = new paragraph or list item; Shift+Enter = hard break; `·` for trailing spaces |
| [links-autolinks.md](./links-autolinks.md) | Clickable links, angle-bracket autolinks, reference links, link-definition styling |
| [edge-cases.md](./edge-cases.md) | Long wrap, unclosed emphasis, dangerous HTML stripped, broken images |
| [blank.md](./blank.md) | Empty file click places caret; typing works from a blank state |
| [large/*](./large/) (after fetch) | Scroll/parse stress: 14 MB corpus, huge tables, 128k-line README, MDN reference |

## Settings to try

| Setting | Effect |
| :--- | :--- |
| `markdownInlineEditor.tables.style` | `wrapped` (default) wraps long cells; compare with other values if present |
| `markdownInlineEditor.colors.*` | Heading, bold, italic, code, and link colors in the WYSIWYG view |

## Editor chrome (not in these files)

- **Title bar swap** — Switch between the built-in text editor and Markdown Editor for the same `.md` file.
- **Discard** — When the file changed on disk and the editor buffer differs, use **Discard** to reload from disk.
- **Open Preview** — On idle mermaid fences (see [showcase.md](./showcase.md) and [../mermaid/](../mermaid/)).

## Quick checklist

- [ ] Table cell click opens nested editor; edits persist when you leave the cell.
- [ ] Hover table row/column gap shows **+**; border select + Backspace/Delete removes row/column.
- [ ] Idle code fence shows language badge; click fence edits source; untokenized text uses editor foreground.
- [ ] Mermaid fence shows **Open Preview** and inline diagram; preview follows workbench theme.
- [ ] Idle HTML block shows sanitized preview; `script` / `iframe` / `style` stripped; `<details>` toggles.
- [ ] Task checkbox click toggles without splitting `[ ]` onto two lines.
- [ ] Link click opens target; table cell links work.
- [ ] Trailing spaces at paragraph end show `·`; mid-sentence spaces do not.
- [ ] Enter at end of list item continues the list; Shift+Enter inserts a visible line break.
