# Inline Markdown playground

## Dev server (`npm run dev:markdown-inline`)

Treat the playground dev server as **already running** at `http://127.0.0.1:5175/` for the whole session. Open that URL and rely on HMR for editor and playground changes.

Do not stop, kill, or restart the process (no `pkill`, port cleanup, or second `npm run dev:markdown-inline` while the URL responds). Start the script only when `http://127.0.0.1:5175/` is unreachable and you need a local server.

## Fixtures

Test markdown files live in `docs/tests/markdown/` and load via `?fixture=<path>` (default `playground.md`).
Feature samples live in `src/markdownInline/tests/<feature>/fixtures/` and load the same way, for example `?fixture=list/fixtures/case-1.md`.

## VS Code iframe theme (`vscode-iframe-injected-theme.css`)

`vscode-iframe-injected-theme.css` is a **real copy** of the CSS custom properties VS Code injects on a custom-editor webview iframe (`<html style="--vscode-…">`). The playground loads it as a normal stylesheet so Monaco and task checkboxes see the same tokens as in the extension host.

**Keep this file in sync with your theme.** When you change `workbench.colorTheme` or `workbench.colorCustomizations`, re-export from VS Code (save the iframe `html` `style` attribute) and replace the variable block in `vscode-iframe-injected-theme.css`, or regenerate from the repo-root `iframeinjectedcss.html` capture.

Scoped selectors match the editor mount: `:root`, `.inline-md-root`, and `.inline-md-root .monaco-editor` (Monaco sets its own `--vscode-*` on `.monaco-editor`).

## Settings overrides

`vscodeUserTheme.ts` still reads `/home/econn/.config/Code/User/settings.json` on Linux and injects a small `<style id="vscode-user-settings-overrides">` for anything not in the iframe snapshot (for example `markdownInlineEditor.colors` and late `workbench.colorCustomizations`).

## Reference

Treat `settings.json` and this CSS file together as playground theme truth, not ad hoc colors in `playground.css`.
