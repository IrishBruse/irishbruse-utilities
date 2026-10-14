# markdownInline

A deep module.
The interface is the root files.
The editor implementation sits in `lib/`.
The VS Code host implementation sits in `host/`.

```
src/markdownInline/
  index.ts       entry point for the editor
  skill.ts       entry point for skill front matter
  host.ts        entry point for the VS Code host
  lib/           editor implementation
  host/          VS Code host implementation
  lib/**/test/   tests for that part
```

Import this package through an entry point (a file at this folder's root).

```ts
import { mountInlineEditor } from "../markdownInline";
import { parseSkillFrontMatter } from "../markdownInline/skill";
import { registerMarkdownInlineEditor } from "../markdownInline/host";
```

Add another entry point by adding a root file that delegates to a subfolder.
Keep that file small.
Expose several entry points.
A barrel re-exports a whole subtree through one index.
Keep that pattern out of the package root.

**Entry-point boundary.**
Code outside this package imports only those root files.
A path into `lib/` or any other subfolder is a failed check.

**Intra-package freedom.**
Files in this package import each other freely.
`lib/` may import `lib/`.

**Tests beside the part.**
A test lives in a `test/` folder next to the source it covers.
A browser check imports `lib/test/support/browser.ts`.

**No cycles.**
Dependencies in this package do not form a cycle.

**Lib containment.**
Files under `lib/` do not import outside this package except `src/lib/`.
Host files may import `vscode` and the `src/constants.ts` shared roots.

**Playground through entry points.**
Files under `playground/` import only this package's entry points and other files under `playground/`.

**No cross-feature imports.**
Sibling folders under `src/` do not import each other.
Shared code lives in `src/lib/`.

Run the check with `npm run lint` from the repo root.
