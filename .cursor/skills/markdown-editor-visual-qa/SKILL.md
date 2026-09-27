---
name: markdown-editor-visual-qa
description: "Verify Markdown Editor webview and playground changes in the Vite playground with agent-browser. Use when editing, fixing, or testing the markdown editor, its CSS, fixtures, lock, tables, Mermaid, HTML, or SKILL.md Properties."
---

# markdown-editor-visual-qa

When a change touches the Markdown Editor webview or playground, verify it here before finishing.

Playground: `npm run dev:markdown-editor`. Use the Local URL Vite prints (default `http://localhost:5174/`).
Fixtures live in `docs/tests/markdown/`. `?fixture=` is the path under that folder (`showcase.md`, `SKILL.md`, `large/awesome-selfhosted.md`).
Drive the page with agent-browser. Load `agent-browser skills get core` first. Keep `--session markdown-editor` on every command.

The playground serves the webview source. A webview edit is on the next load. No extension rebuild.

## 1. Serve

If the playground URL is down:

```bash
npm run dev:markdown-editor
```

**Done when:** that URL responds.

## 2. Open the fixture the change touches

```bash
agent-browser --session markdown-editor open "http://localhost:5174/?fixture=showcase.md"
agent-browser --session markdown-editor snapshot -i
```

**Done when:** the snapshot shows that fixture's content.

## 3. Exercise the change

Click, type, and switch fixtures the way the change is used. Snapshot again after the page changes. Reload if the edit is not visible yet.

**Done when:** the snapshot shows the new behavior, or the failure names the fixture and what the page shows.

## 4. Smoke when the change is broad

- Lock control top-right, default unlocked (`Editing; switch to locked mode`).
- `showcase.md`: heading colors, a code language badge, a Mermaid diagram, HTML `<details>`.
- `table-columns.md`: short columns one word, long cells wrap.
- `SKILL.md`: Properties card. Other files: YAML as a fence.
- `lists-tasks.md`: checkbox toggle stays one line.
- `blank.md`: empty canvas, click-to-edit.

**Done when:** failures are listed with fixture name and what the snapshot shows.

## Host limits

- Code fence colors are unstyled. A language badge means the fence painted.
- Mermaid **Open Preview** does not open a side panel. The inline diagram is the check.
- Edits stay in the page until reload.
