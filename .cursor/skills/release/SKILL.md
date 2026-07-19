---
name: release
description: Release version bumps, changelogs, and Marketplace publish via npm run release.
---

# Release

Scope: **version** and **changelog** only. `npm run release` handles verify, VSIX, Entra ID publish, commit, and push.

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

## 2. Update changelog

Only when `CHANGELOG.md` lacks `## {version}`:

1. Draft user-facing **Add**, **Fix**, **Remove** bullets from git history.
2. Prepend section with `-   Add:` / `-   Fix:` / `-   Remove:` prefixes.
3. Update `README.md` for user-facing feature or command changes.

Leave `package.json` and `package-lock.json` to the release script.

**Done when:** `CHANGELOG.md` has `## {version}` (or already did - skip edits).

## 3. Gate

The **gate** is the sole path to `npm run release`. Prior bump or changelog work does not approve release.

1. Resolve the full command: `npm run release -- {version}`.
2. **AskQuestion** immediately before running - proposal only in `prompt`, plain markdown (`**Label:**` fields, blank lines between), never in chat:

- `title`: `Release {version} - Approve`
- `prompt`: `I will run:` then:
  - `**Command:**` `npm run release -- {version}`
  - `**Version:**` `{current} -> {target}`
  - `**Steps:**` bump `package.json`/`package-lock.json`, `npm run verify`, `npm run package:vsix`,
    `npx @vscode/vsce publish` (browser OAuth, or `--azure-credential` in CI), `git commit`, `git push`
  - `**Changelog:**` confirm `## {version}` exists
  - End with `Run this release?`
- `options` (exactly these three): `Approve - run this exact release`, `Edit first - change version before running`, `Cancel - do not run release`

3. **Approve**: run that exact command once.
4. **Edit first**: revise and re-gate.
5. **Cancel**: stop.

Version change: re-gate.

**Done when:** user **Approve**s the exact command shown.

## 4. Run release

```bash
npm run release -- {version}
```

Examples: `npm run release -- 0.10.0`, `npm run release -- minor`, `npm run release -- patch`.

Publishing uses `vsce publish --azure-credential` in CI when `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID` are set.

Otherwise `scripts/release.mjs` opens a browser OAuth sign-in and publishes with the resulting Entra access token.

**Done when:** command exits 0.

## Response

Report: new version, changelog summary (2-4 bullets), release command output.
