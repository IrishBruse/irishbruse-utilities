# markdownInline

A deep module.
The interface is the root files.
The implementation sits in `lib/`.

```
src/markdownInline/
  index.ts       entry point for the editor
  skill.ts       entry point for skill front matter
  lib/           implementation
  tests/         tests and their helpers
```

Import this package through an entry point (a file at this folder's root).

```ts
import { mountInlineEditor } from "../markdownInline";
import { parseSkillFrontMatter } from "../markdownInline/skill";
```

Add another entry point by adding a root file that delegates to `lib/`.
Keep that file small.
Expose several entry points.
A barrel re-exports a whole subtree through one index.
Keep that pattern out of the package root.

**Entry-point boundary.**
Code outside this package imports only those root files.
A path into `lib/` or any other subfolder is a failed check.

**Intra-package freedom.**
Files in this package, other than `tests/`, import each other freely.
`lib/` may import `lib/`.

**Tests through the entry points.**
A file under `tests/` imports entry points and other files under `tests/`.
It does not import `lib/` or another package's subfolder.

**No cycles.**
Dependencies in this package do not form a cycle.

**Lib containment.**
Files under `lib/` do not import outside this package except `src/mermaidEditor/`.

**Playground through entry points.**
Files under `playground/` import only this package's entry points and other files under `playground/`.

**Layering.**
This package does not import `src/markdownInlineHost/`.
The playground does not import `src/mermaidEditor/`.

Run the check with `npm run lint:boundaries`.
