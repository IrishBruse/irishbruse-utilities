---
name: setup-ts-deep-modules
description: Wire the Oxlint boundaries plugin so each TypeScript package is a deep module.
disable-model-invocation: true
---

# Setup TS Deep Modules

Make each governed package a **deep module**: a lot of behaviour behind a small interface.
The interface is the package's **entry points** (the files at the package root).
Everything in a subfolder is hidden.
**Depth** is that ratio: a wide implementation behind a narrow interface.
The **seam** is the entry-point file list.
Outsiders cross the seam.
They do not reach past it.

Install the Oxlint boundaries plugin and the rules that make the entry points the only way in.
Then prove the rules bite.

## The shape

```
<packages-root>/
  <name>/
    index.ts
    client.ts
    lib/
    tests/
```

`index.ts` and `client.ts` are entry points.
A package may expose several.
`lib/` holds implementation.
`tests/` holds tests and fixtures.
The rule is path depth, not those two names.
Any subfolder is private.
A new folder needs no config change.
Adding an entry point is adding a root file.

Keep each entry point small.
An entry point that re-exports a whole subtree is a barrel.
Prefer several small entry points.

Packages are flat.
One tier of children sits under the packages root.
A package's internals may nest.
A package does not contain another package.

Layering (which package may import which) is not covered.
Add a `boundaries` rule when this repo needs it.

## Rules

All four are errors.
Same-package imports stay free because the plugin resolves each import to a path and compares that path with the importing file.
Keep the resolution.
A rule that matches import text alone cannot tell a package's own files from an outsider.

1. **Entry-point boundary.** Code outside a package may import only that package's root files.
   The rule covers both another package and any file outside the packages root.
2. **Intra-package freedom.** A package's own files, other than `tests/`, import each other freely.
   That freedom is the same-package exemption on `entry-point-boundary`, not a fifth rule.
3. **Tests through the entry points.** A file under `<pkg>/tests/` may import any package's entry points and its own `tests/` tree.
   It may not import a subfolder of any package, including its own.
4. **No cycles.** Oxlint's `import/no-cycle` reports cycles anywhere in the repo.

## Steps

### 1. Detect the environment

Package manager: `pnpm-lock.yaml` means pnpm, `yarn.lock` means yarn, `bun.lockb` means bun, otherwise npm.
Use that manager for every command below.

Packages root: `src/packages` when `src/` exists, otherwise `packages`.
When the repo already uses a different layout, govern the package the user named.
Add that folder name to `packages` and to `features` in step 3.

Existing config: look for `lint/dependencyBoundaries.js` and for `boundaries/` rules in the lint block of `vite.config.ts`.
When the plugin exists, merge the missing rules and options and say what you added.

**Done when:** package manager, packages root, package list, and existing-config status are known.

### 2. Add the plugin

Copy [`boundariesPlugin.js`](./boundariesPlugin.js) to `lint/dependencyBoundaries.js`.
Keep the file name.
The lint block reads it by that path.

**Done when:** `lint/dependencyBoundaries.js` exists.

### 3. Add the rules

Open the lint block of `vite.config.ts`.
Add `"import"` to `plugins`.
Add the plugin to `jsPlugins`.
Define `boundaryOptions` above the config object.
Add the five `boundaries/*` rules and `import/no-cycle` to `rules`.

```ts
const boundaryOptions = {
    packagesRoot: "src/packages",
    packages: ["example"],
    features: ["example"],
    testsFolder: "tests",
    playgroundFolder: "playground",
    excludeExtensions: [".css", ".ttf", ".woff", ".woff2", ".svg", ".png", ".md"],
    excludeFolders: ["node_modules"],
    contained: { package: "example", folder: "lib", sharedRoots: ["lib"] },
};

export default defineConfig({
    lint: {
        plugins: ["oxc", "typescript", "unicorn", "import"],
        jsPlugins: [{ name: "boundaries", specifier: "./lint/dependencyBoundaries.js" }],
        rules: {
            "import/no-cycle": "error",
            "boundaries/entry-point-boundary": ["error", boundaryOptions],
            "boundaries/no-cross-feature": ["error", boundaryOptions],
            "boundaries/tests-through-entrypoints": ["error", boundaryOptions],
            "boundaries/playground-through-entrypoints": ["error", boundaryOptions],
            "boundaries/lib-contained": ["error", boundaryOptions],
        },
    },
});
```

Keep the other keys of the lint block.
`packagesRoot` is relative to the directory that runs lint.
`features` lists every folder under the packages root except the shared folders, so a shared `lib/` or `commands/` is not a feature.
`contained` governs the one package that hides its implementation in `lib/`.
Drop `contained` when no package needs it.
`excludeExtensions` skips style and image imports.

**Done when:** the lint block names the plugin, the five rules, and `import/no-cycle`.

### 4. Wire it into the checks

Run the boundaries as part of the command that already runs typecheck.
In a Vite+ repo that is `vp lint .`, folded into the `lint` script.
Add `lint` to the umbrella script, such as `verify`, when the repo has one.
Keep `vp check` in the pre-commit hook so staged files get the same rules.
Leave `tsconfig` path aliases unchanged.

**Done when:** one command runs typecheck and the boundaries, and the pre-commit hook runs the same rules.

### 5. Shape the package

When the user names an existing package, reshape that package.
Move its implementation to `lib/`.
Put a small entry point at the package root for each public seam.
Each entry point delegates to `lib/`.
Point files under `tests/` at entry points.
Put shared test helpers under `tests/` so the tests rule can see them.

When the user names no package, add `<packages-root>/example/` as a copy-me template:

- `index.ts` exports one function that delegates to `lib/`.
- `lib/impl.ts` is the internal file.
- `tests/example.test.ts` imports only `../index`.

Tell the user the template is there to copy or delete.

**Done when:** the package exposes its behaviour through root entry points and keeps implementation in a subfolder.

### 6. Prove the rules bite

A config that stays green on a violation is unfinished.

1. Run the lint command.
   It passes on the clean package.
2. Add a deep import in a file under that package's `tests/` (for example `import { thing } from "../lib/impl"`).
   Run the lint command again.
   It fails with `boundaries(tests-through-entrypoints)`.
3. Revert the deep import.
   Run once more.
   It passes.

**Done when:** you have seen a pass, then a fail on `boundaries(tests-through-entrypoints)`, then a pass.
When step 2 stays green, fix the rules before you finish.

### 7. Document the convention

Write a `README.md` next to the packages it governs.
For one named package in a mixed tree, put that README in the package folder.
Cover the layout (entry points at the root, `lib/` for implementation, `tests/` for tests), "import only through a package's entry points", and how to run the lint command.
Say to expose several small entry points instead of re-exporting a whole subtree through one index.
Keep it to the copy-me snippet plus one short paragraph for each rule.

Add one context pointer from the repo instruction file (`CLAUDE.md` when it exists, otherwise `AGENTS.md`, and create `AGENTS.md` when neither exists).
Example: `Packages are deep modules: see [src/markdownInline/README.md](./src/markdownInline/README.md) before adding or importing one.`

**Done when:** the README exists and discourages barrels, and `CLAUDE.md` or `AGENTS.md` links to it.
