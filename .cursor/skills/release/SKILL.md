---
name: release
description: Prepare a release changelog and version, then run npm run release. Use for release prep, version bumps, changelog updates, or Marketplace publish.
---

# Release

Your job is limited to **version** and **changelog**. `npm run release` handles verify, VSIX packaging, Marketplace publish, commit, and push.

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

## 3. Run release

One command - pass the target version or bump type:

```bash
npm run release -- {version}
```

Examples: `npm run release -- 0.10.0`, `npm run release -- minor`, `npm run release -- patch`.

If `package.json` is already at the target version and only Marketplace publish is needed:

```bash
npm run release -- {version} --publish-only
```

One-time Marketplace auth per machine (optional, without it publish runs via GitHub Actions on push):

```bash
export VSCE_PAT=<token>   # from https://dev.azure.com, Marketplace: Manage
```

**Done when:** the command exits 0.

## Response

Report: new version, changelog summary (2-4 bullets), and release command output.
