---
name: release
description: Release version bumps, changelogs, and Marketplace publish via npm run release. Use when the user asks to release, ship, publish, or bump version.
---

# Release

Scope: **version** and **changelog** only. `npm run release` bumps `package.json`/`package-lock.json`, verifies, packages, publishes, commits, and pushes.

## 1. Resolve version

1. Read `package.json` version, skim `git log` since the last version commit or tag.
2. Use an explicit semver or bump (`patch`, `minor`, `major`) when the user gave one.
3. Otherwise **AskQuestion** once before file edits:

**Context:** one sentence naming the project and current version.

**Recommendation:** minor for features, patch for fixes-only.

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

**Other**: use their custom semver.

**Done when:** target version is decided.

## 2. Changelog

Only when `CHANGELOG.md` lacks `## {version}`:

1. Draft bullets from git history and `## Unreleased`.
2. **Changelog review** - edit down to high-level, user-facing items only:
   - One bullet per theme users care about, not per commit or file touched.
   - Merge related small changes into a single bullet.
   - Keep **Add** / **Fix** / **Remove** / **Change** prefixes.
   - Drop internal refactors, test-only work, dev tooling, and agent/doc churn unless users see it.
   - Typical release: ~3-8 bullets, patch releases: fewer.
3. Move reviewed bullets under `## {version}`.
4. Leave `## Unreleased` present with no bullets beneath it.
5. Update `README.md` only for user-facing feature or command changes.

Leave `package.json` and `package-lock.json` to the release script.

**Done when:** `CHANGELOG.md` has `## {version}` with reviewed bullets and an empty `## Unreleased` section (or both already true - skip edits).

## 3. Prep

**Prep** finishes before the **gate**. Do not ask to run release until prep passes.

1. Commit every pending change (features, changelog, README, skill edits).
   Do not bump `package.json` or `package-lock.json` - the release script owns version files.
2. Run `npm run verify` - must exit 0.
3. Confirm `git status` is clean.

**Done when:** working tree is clean and `npm run verify` passed.

## 4. Gate

The **gate** is the sole path to `npm run release`. Prep and changelog work do not approve release.

1. Resolve the full command: `npm run release -- {version}`.
2. **AskQuestion** immediately before running - proposal only in `prompt`, plain markdown (`**Label:**` fields, blank lines between), never in chat:

- `title`: `Release {version} - Approve`
- `prompt`: `I will run:` then:
  - `**Command:**` `npm run release -- {version}`
  - `**Version:**` `{current} -> {target}`
  - `**Prep:**` working tree clean, `npm run verify` passed
  - `**Changelog:**` `## {version}` reviewed, `## Unreleased` empty
  - `**Steps:**` bump `package.json`/`package-lock.json`, `npm run verify`, `npm run package:vsix`,
    `npx @vscode/vsce publish` (browser OAuth, or `--azure-credential` in CI), `git commit`, `git push`
  - End with `Run this release?`
- `options` (exactly these three): `Approve - run this exact release`, `Edit first - change version before running`, `Cancel - do not run release`

3. **Approve**: run that exact command once.
4. **Edit first**: revise and re-run prep if needed, then re-gate.
5. **Cancel**: stop.

Version change: re-run Changelog (section 2), Prep (section 3), then Gate (section 4) before approving the release.

**Done when:** user **Approve**s the exact command shown.

## 5. Run release

```bash
npm run release -- {version}
```

Examples: `npm run release -- 0.10.0`, `npm run release -- minor`, `npm run release -- patch`.

Publishing uses `vsce publish --azure-credential` in CI when `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID` are set.

Otherwise `npm run release` opens a browser OAuth sign-in and publishes with the resulting Entra access token.

**Done when:** command exits 0.

## Response

Report: new version, changelog summary (2-4 bullets), release command output.
