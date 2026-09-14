# Large real-world Markdown fixtures

Curated downloads from public repos — too big to commit, but useful for scroll, parse, and table stress tests in **Markdown Editor (ib-utilities)**.

## Download

From the repo root:

```bash
npm run fetch-markdown-large-fixtures
```

Or fetch one file:

```bash
node docs/tests/markdown/fetch-large-fixtures.mjs reltio-docs.md
```

Files land in this folder (`docs/tests/markdown/large/`). They are gitignored after download.

## Fixtures

| File | ~Size | Source | Good for |
| :--- | :--- | :--- | :--- |
| `reltio-docs.md` | 14 MB | [reltio-ai/reltio-ai-ready-docs](https://github.com/reltio-ai/reltio-ai-ready-docs) | Full-doc scroll, thousands of headings, API tables, code fences |
| `reltio-index.md` | 3.7 MB | same repo | Dense link/index structure, mid-size parse |
| `awesome-selfhosted.md` | 320 KB | [awesome-selfhosted/awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted) | Huge tables, nested TOC, thousands of links |
| `stylelint-changelog.md` | 265 KB | [stylelint/stylelint](https://github.com/stylelint/stylelint) | Long changelog lists, version headings, issue links |
| `cirosantilli-readme-large.md` | 1 MB | [cirosantilli/test-md-readme-large](https://github.com/cirosantilli/test-md-readme-large) | ~128k short lines (GitHub’s 512 KB render cap stress test) |
| `mdn-array.md` | 50 KB | [mdn/content](https://github.com/mdn/content) | MDN front matter, spec tables, syntax examples |

## Suggested test order

1. **mdn-array.md** — confirm rich reference markup still renders.
2. **awesome-selfhosted.md** — scroll through table sections; click links; narrow the editor for wrap.
3. **stylelint-changelog.md** — heading navigation and long list performance.
4. **reltio-index.md** — larger parse without the full 14 MB cost.
5. **reltio-docs.md** — worst-case full document (open last; may take a moment).
6. **cirosantilli-readme-large.md** — ~128k-line stress; check typing and caret at EOF.

## Open in the editor

1. Download fixtures (above).
2. Open a file from this folder in VS Code.
3. **Reopen Editor With... → Markdown Editor (ib-utilities)**.

Small handcrafted fixtures: [../README.md](../README.md).

## Re-fetch

The script overwrites existing files. Re-run after upstream repos update, or when you want a clean copy.
