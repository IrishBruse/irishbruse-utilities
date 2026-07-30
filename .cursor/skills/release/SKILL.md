---
name: release
description: Release version bumps, changelogs, and Marketplace publish via npm run release. Use when the user asks to release, ship, publish, or bump version.
---

# Release

Scope: **changelog**, **stamp** (version commit), and **publish** (Marketplace deploy). The release script stamps or publishes; it does not write changelog bullets.

## 1. Resolve version

1. Read `package.json` version and skim `git log` since the last version commit or tag.
2. Use an explicit semver or bump (`patch`, `minor`, `major`) when the user gave one.
3. Otherwise **AskQuestion** once — prompt only: `Current version is {current}. Which release bump?` — options: `Minor ({nextMinor})`, `Patch ({nextPatch})`. Custom semver from the user skips the question.

**Done when:** target version is decided.

## 2. Changelog

Only when `CHANGELOG.md` lacks `## {version}`:

1. Draft bullets from git history and `## Unreleased`.
2. **Changelog review** — keep user-facing items only:
   - One bullet per theme; merge small related changes.
   - Prefixes: **Add** / **Fix** / **Remove** / **Change**.
   - Drop refactors, tests, dev tooling, and agent churn unless users see it.
   - Patch: ~1–3 bullets; minor: ~3–8.
3. Move reviewed bullets under `## {version}`; leave `## Unreleased` empty.
4. Update `README.md` only for user-facing feature or command changes.
5. Do **not** commit `CHANGELOG.md` or `README.md` yet. Leave them for the version commit in **stamp**.

**Done when:** `## {version}` exists with reviewed bullets, `## Unreleased` is empty, and changelog/README edits are unstaged or staged but uncommitted.

## 3. Prep

1. Commit every other pending change (features, skill edits). Do not bump version files yet.
2. Run `npm run verify` — must exit 0.
3. Confirm only release docs and version files remain uncommitted (`CHANGELOG.md`, `README.md` when changed, and `package.json` / `package-lock.json` until stamp).

**Done when:** feature work is committed, `npm run verify` passed, and changelog/README are ready for stamp.

## 4. Stamp

Run once:

```bash
npm run release -- {version}
```

This bumps `package.json` / `package-lock.json` and commits `{version}` together with `CHANGELOG.md` and `README.md` when changed. It does not publish.

**Done when:** `package.json` version is `{version}` and that single version commit exists locally.

## 5. Gate

**AskQuestion** immediately before publish — no duplicate proposal in chat; the tool prompt is the only summary.

- `title`: `Publish {version}?`
- `prompt`: `Publish {version} to the VS Code Marketplace?`
- `options`: `Approve publish`, `Edit version`, `Cancel`

- **Approve publish**: run `npm run release -- {version} --publish` once.
- **Edit version**: revise from section 1; re-run changelog/prep/stamp/gate as needed.
- **Cancel**: stop.

**Done when:** user chooses **Approve publish**.

## 6. Publish

```bash
npm run release -- {version} --publish
```

Runs `npm run verify`, `npm run package:vsix`, `vsce publish`, and `git push`. Version files are already committed from **stamp**.

CI uses `vsce publish --azure-credential` when `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID` are set. Otherwise browser OAuth supplies the token.

**Done when:** command exits 0.

## Response

Report: new version, changelog summary (2–4 bullets), publish command output.
