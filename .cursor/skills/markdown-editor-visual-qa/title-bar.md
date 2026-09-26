# Title bar (markdown custom editors)

Commands (from `package.json`):

| Button | Command |
| :--- | :--- |
| Open Markdown Editor | `ib-utilities.openMarkdownEditor` |
| Open Standalone Markdown Editor | `ib-utilities.openMarkdownEditorStandalone` |
| Open Text Editor | `ib-utilities.openMarkdownSource` |

On a **text** `.md` tab, snapshot should include both Open Markdown Editor and Open Standalone Markdown Editor.

On **standalone**, snapshot should include Open Markdown Editor and Open Text Editor (not Open Standalone).

On **Markdown Editor (ib-utilities)**, snapshot should include Open Standalone Markdown Editor and Open Text Editor (not Open Markdown Editor).

Diff tabs must not use either custom editor.

Reopen Editor With... also lists:

- Markdown Editor (ib-utilities)
- Markdown Editor Standalone (ib-utilities)
