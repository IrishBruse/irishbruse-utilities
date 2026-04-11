# Rules

1. Write all plans to docs/ before implementating anything
2. When you encounter something you didnt expect in this code base update `Quirks` in the `AGENTS.md`
3. When you encounter something that took a very long time add the shortcut to solving it to `Shortcuts` in the `AGENTS.md`
4. Always make sure to verify changes with command `npm run verify` before finishing

# Commands

- Test: `npm run test`
- Build: `npm run build`
- Lint: `npm run lint`

# Style

- Only ever use doc comments in the code never add normal none doc related comments.
- Never use _ in variable names
- No Emojis
- Test files are at `*.test.ts`

# Shorcuts

- Run generates to auto generate some parts of the code.

# Quirks

- The docked IB Chat view is focused with `ibChatView.focus`, not `workbench.view.ibChatContainer`, so it works whether the view sits in the panel or after the user moves it to a sidebar.
- VS Code does not pass the explorer selection into a command invoked by a keybinding; only context-menu invocations receive `resource` as the first argument. Paste Image saves the clipboard image to a temp file first, then runs the built-in `copyFilePath` command and reads the clipboard so the explorer selection path is available without losing the image data. With no explorer selection, the image is written to the first workspace folder root.
- Smart paste uses the same `ctrl+v`  chord as the built-in paste. If both bindings match, which command runs depends on VS Code keybinding resolution; Keyboard Shortcuts can be used to confirm or change precedence.
