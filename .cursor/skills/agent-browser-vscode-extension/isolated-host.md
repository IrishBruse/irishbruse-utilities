# Isolated Extension Development Host

Temp files stay under repo `.tmp/` (not committed).

## Flags

```bash
ROOT="<workspace>"
PORT="${AB_CDP_PORT:-9226}"   # pick a free port if 9226 is taken
PROFILE="$ROOT/.tmp/vscode-ab-profile"
EXTDIR="$ROOT/.tmp/vscode-ab-ext"

code \
  --extensionDevelopmentPath="$ROOT" \
  --user-data-dir="$PROFILE" \
  --extensions-dir="$EXTDIR" \
  --remote-debugging-port="$PORT" \
  --disable-workspace-trust \
  "$ROOT/docs/tests/markdown"
```

`--user-data-dir` and `--extensions-dir` must both be unique. `code --remote-debugging-port` without them attaches to an already-running Code that has no CDP.

`code --install-extension` on a `.vsix` can hang the GUI. For a packaged build, unpack the VSIX into `--extensions-dir` instead.

`.vscode/launch.json` **Run Extension** is F5 in the user's IDE. That is a different window, do not agent-browser it unless the user said to.

## After launch

Wait until the Extension Development Host workbench is painted, then `agent-browser --session ib-ext connect` on the printed port. Hide Cursor chat in that window if it covers the editor.

Git in this profile: leave **Never** / do not run SCM unless the test needs it.

## Packaged VSIX

1. `npm run package:vsix`
2. Unpack into `$EXTDIR` (extension folder name from the VSIX `extension/` tree).
3. Same `--user-data-dir` / `--remote-debugging-port` pattern, **without** `--extensionDevelopmentPath`.
4. Confirm the status bar / About / Extensions view shows the VSIX version, not an older Marketplace copy.
