---
name: markdown-editor-visual-qa
description: "Visual and flow QA for Markdown Editor and Markdown Editor Standalone via agent-browser. Use when testing those custom editors, recording docs/markdownEditorStandalone screenshots, or checking lock, tables, Mermaid, HTML, SKILL.md Properties, or title-bar swap."
---

# markdown-editor-visual-qa

If the isolated host is not attached, read and follow `.cursor/skills/agent-browser-vscode-extension/` first (host, CDP session `ib-ext`, webview iframe).

Fixtures: `docs/tests/markdown/README.md`.
Screenshot campaign (one folder per part): `docs/markdownEditorStandalone/README.md`.
Title-bar names: [title-bar.md](title-bar.md).

## 1. Build

```bash
npm run build
```

Reload the Extension Development Host after webview CSS/JS changes.

**Done when:** `dist/` and both markdown-editor webview bundles are current.

## 2. Open a fixture

Open files under `docs/tests/markdown/`. New tabs often use the **text** editor.

To enter standalone, snapshot then click **Open Standalone Markdown Editor**.
To enter Markdown Editor (110), click **Open Markdown Editor**.

Picker label when standalone is active: **Markdown Editor Standalone (ib-utilities)**.

**Done when:** the active tab's editor picker matches the editor under test.

## 3. Record a part

For each folder in `docs/markdownEditorStandalone/`:

1. Follow that folder's README (fixture + expected chrome).
2. Screenshot into that folder (no `--color-scheme`).
3. Read the PNG. Keep the shot only if it shows that part (not a leftover scroll position).

**Done when:** every campaign folder has a README and a PNG that matches it.

## 4. Smoke checks (both editors)

- Title bar: standalone hidden when already standalone; Markdown Editor hidden when that editor is active, neither used for diffs.
- Lock pill top-right, default unlocked.
- `showcase.md`: headings colors, code badges, Mermaid **Open Preview**, HTML sanitizer / `<details>`.
- `table-columns.md`: short columns one word, long cells wrap, no `+ row` chrome.
- `SKILL.md`: Properties card. Other files: YAML as a fence.
- `lists-tasks.md`: checkbox toggle stays one line.
- `blank.md`: empty canvas, click-to-edit.

**Done when:** failures are listed with fixture name and what the screenshot shows.
