---
name: release
description: Prepare a release changelog and version, then run npm run release. Use for release prep, version bumps, changelog updates, or Marketplace publish.
---

# Release

Your job is limited to **version** and **changelog**. `npm run release` handles verify, VSIX packaging, Entra ID publish, commit, and push.

## 1. Resolve version

1. Read `package.json` version (and skim `git log` since the last version commit or tag).
2. If the user gave an explicit semver or bump (`patch`, `minor`, `major`), use it.
3. Otherwise call **AskQuestion** once before any file edits:

**Context:** one sentence naming the project and current version.

**Recommendation:** minor for new features, patch for fixes-only.

```text
AskQuestion
  id: release-bump
  prompt: "Current version is {current}. Which release bump?"
  options:
    - id: minor
      label: "Minor ({nextMinor})"
    - id: patch
      label: "Patch ({nextPatch})"
```

If the user picks **Other**, use their custom semver.

**Done when:** target version is decided.

## 2. Update changelog

Only when `CHANGELOG.md` lacks a `## {version}` section:

1. Draft user-facing **Add**, **Fix**, and **Remove** bullets from git history.
2. Prepend the section using `-   Add:` / `-   Fix:` / `-   Remove:` prefixes.
3. Update `README.md` only for user-facing feature or command changes.

Do **not** edit `package.json` or `package-lock.json`.

**Done when:** `CHANGELOG.md` has the section (or already had it - skip edits).

## 3. Confirm release

This gate is the **only** way to run `npm run release`.
No prior version choice, changelog edit, or silence may substitute for it.
If this gate has not been answered with its approve option for the exact command shown, do not run release.

Steps, in order:

1. Resolve the full command, including any flags (`--publish-only`, `--no-commit`, `--no-push`).
2. Call `AskQuestion` immediately before running it, using the fixed shape below and no other options.
   Put the full proposed release in the `prompt` field only.
   Do not echo the proposal in chat before or after the tool call.
3. Run release **only** when the user selects `Approve`.
4. If the user selects `Edit first`, revise the plan and run this gate again.
5. If the user selects `Cancel`, stop and do not run release.

Rules:

- One approval covers one exact command. If the version, flags, or steps change, run the gate again.
- Never infer approval from an earlier bump choice, changelog edit, or the absence of objection. Only the `Approve` option in this gate counts.
- The `prompt` must use plain markdown so labels and values render for the user.
  Use `**Label:**` for field names and separate fields with blank lines.
  Never wrap the proposal in a code fence in chat or inside the `prompt`.

Populate the `AskQuestion` tool with these exact fields and no other options.
This describes tool input, so never print the fields, labels, option text, or any fence as chat text:

- `title`: `Release {version} - Approve`
- `prompt`: open with `I will run:`, then list:
  - `**Command:**` the exact `npm run release -- ...` command
  - `**Version:**` `{current} -> {target}` (or `{target} (publish only)` when `--publish-only`)
  - `**Steps:**` bullet list of what the script will do:
    bump `package.json`/`package-lock.json` unless publish-only;
    `npm run verify`; `npm run package:vsix`;
    `npx @vscode/vsce publish --azure-credential`;
    `git commit` unless `--no-commit`; `git push` unless `--no-push`
  - `**Changelog:**` confirm `CHANGELOG.md` has `## {version}`
  End with `Run this release?`
- `options` (exactly these three, in order):
  - `Approve - run this exact release`
  - `Edit first - change version or flags before running`
  - `Cancel - do not run release`

**Done when:** the user approves the exact command to run.

## 4. Run release

Run only the approved command:

```bash
npm run release -- {version}
```

Examples: `npm run release -- 0.10.0`, `npm run release -- minor`, `npm run release -- patch`.

If `package.json` is already at the target version and only Marketplace publish is needed:

```bash
npm run release -- {version} --publish-only
```

First publish on a machine requires Microsoft Entra ID sign-in via `az login` (or another credential in vsce's chain).

**Done when:** the command exits 0.

## Response

Report: new version, changelog summary (2-4 bullets), and release command output.
