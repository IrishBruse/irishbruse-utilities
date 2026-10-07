---
name: setup-ts-deep-modules
description: Wire dependency-cruiser so each TypeScript package is a deep module.
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

Install [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) and the rules that make the entry points the only way in.
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

Layering (which package may import which) stays a rule named `layering` with severity `ignore` until this repo fills it in.

## Rules

All four are errors.
Same-package imports stay free because `entry-point-boundary` uses dependency-cruiser's `$1` group.
Keep that back-reference.
A separate rule per package drops the group match.

1. **Entry-point boundary.** Code outside a package may import only that package's root files.
   The rule is two matches with one name: other packages (the `$1` `pathNot`) and files outside the packages root.
2. **Intra-package freedom.** A package's own files, other than `tests/`, import each other freely.
   That freedom is the `$1` exemption on `entry-point-boundary`, not a fifth rule.
3. **Tests through the entry points.** A file under `<pkg>/tests/` may import any package's entry points and its own `tests/` tree.
   It may not import a subfolder of any package, including its own.
4. **No cycles.** No dependency cycles inside the governed packages.

## Steps

### 1. Detect the environment

Package manager: `pnpm-lock.yaml` means pnpm, `yarn.lock` means yarn, `bun.lockb` means bun, otherwise npm.
Use that manager for every command below.

Packages root: `src/packages` when `src/` exists, otherwise `packages`.
When the repo already uses a different layout, govern the package the user named.
Set `PACKAGE_PATTERN` in the config to that folder's name.
The default pattern is `[^/]+` (every child of the packages root).

Existing config: look for `.dependency-cruiser.*`.
When one exists, merge these rules and options into it and say what you added.

**Done when:** package manager, packages root, package pattern, and existing-config status are known.

### 2. Install dependency-cruiser

Install `dependency-cruiser` as a devDependency with the detected package manager.

**Done when:** `dependency-cruiser` is in `devDependencies`.

### 3. Write the config

Copy [`dependency-cruiser.config.cjs`](./dependency-cruiser.config.cjs) to the repo root as `.dependency-cruiser.cjs`.
Set `PACKAGES_ROOT`.
Set `PACKAGE_PATTERN` when step 1 narrowed it.
Use `.cjs` so `module.exports` works in a `"type": "module"` repo.

**Done when:** `.dependency-cruiser.cjs` has the chosen `PACKAGES_ROOT` and `PACKAGE_PATTERN`, and the forbidden rules `entry-point-boundary`, `tests-through-entrypoints`, and `no-circular` are present.

### 4. Wire it into the checks

Add a `lint:boundaries` script: `depcruise <cruise-root>`.
The cruise root is the tree that contains both the packages and the code that imports them.
Fold `lint:boundaries` into the command that already runs typecheck.
Leave `tsconfig` path aliases unchanged.
When there is no umbrella script, add `lint:boundaries` and tell the user to include it in CI.

**Done when:** `lint:boundaries` exists and runs as part of the same command as typecheck.

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

1. Run `lint:boundaries`.
   It passes on the clean package.
2. Add a deep import in a file under that package's `tests/` (for example `import { thing } from "../lib/impl"`).
   Run `lint:boundaries` again.
   It fails with `tests-through-entrypoints`.
3. Revert the deep import.
   Run once more.
   It passes.

**Done when:** you have seen a pass, then a fail on `tests-through-entrypoints`, then a pass.
When step 2 stays green, fix the rules before you finish.

### 7. Document the convention

Write a `README.md` next to the packages it governs.
For one named package in a mixed tree, put that README in the package folder.
Cover the layout (entry points at the root, `lib/` for implementation, `tests/` for tests), "import only through a package's entry points", and how to run `lint:boundaries`.
Say to expose several small entry points instead of re-exporting a whole subtree through one index.
Keep it to the copy-me snippet plus one short paragraph for each rule.

Add one context pointer from the repo instruction file (`CLAUDE.md` when it exists, otherwise `AGENTS.md`, and create `AGENTS.md` when neither exists).
Example: `Packages are deep modules: see [src/markdownInline/README.md](./src/markdownInline/README.md) before adding or importing one.`

**Done when:** the README exists and discourages barrels, and `CLAUDE.md` or `AGENTS.md` links to it.
