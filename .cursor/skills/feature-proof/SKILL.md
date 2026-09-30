---
name: feature-proof
description: >-
  Document a shipped or fixed product behavior under docs/features with playground
  or UI verification, committed screenshot assets, and optional gh image links for
  the user. Use when the user invokes /feature-proof, asks for feature proof,
  proof images, docs/features documentation, or screenshot evidence of a change.
---

# feature-proof

Close a user-visible change with **verified behavior**, **repo documentation**, and **images the user can see** (in chat and in git).

This skill composes with domain QA skills (for example [markdown-editor-visual-qa](../markdown-editor-visual-qa/SKILL.md)). Run feature-proof after the behavior is implemented and exercised.

## Outcomes

1. **Feature doc** under `docs/features/<area>/` (markdown, with trailing newline at end of file).
2. **Proof images** in `docs/features/<area>/assets/` referenced from that doc (relative paths).
3. **Optional chat proof**: upload the same PNGs with `gh image` and paste the returned markdown in the reply.
4. **CHANGELOG**: add a line under `## Unreleased` when the change is user-facing (per `AGENTS.md`).

## Workflow

Copy and track:

```text
Feature proof:
- [ ] Expected behavior stated (including “looks wrong but is correct” cases)
- [ ] Fixture or steps to reproduce in the running app
- [ ] Verified in browser (screenshots saved)
- [ ] docs/features/... written with embedded images
- [ ] gh image pasted in user reply (when proof was requested)
- [ ] CHANGELOG Unreleased updated if needed
```

### 1. Define expected behavior

- State what the user should see and what **source data** drives it (for example spaces vs tab characters in markdown).
- If a common fixture looks “wrong” but is correct, document both: **negative proof** (expected dots) and **positive proof** (the new glyph or UI).

### 2. Reproduce in the running app

- Prefer an existing fixture under `docs/tests/`; extend it with a minimal section if the default sample does not exercise the feature.
- For Markdown Editor: assume `npm run dev:markdown-editor` is already running; do not start or kill the server unless it is down.
- Follow [markdown-editor-visual-qa](../markdown-editor-visual-qa/SKILL.md) for playground URLs, fixtures, and `agent-browser --session markdown-editor`.

Scroll the target into view, interact (click, select, type) the way a user would, then capture proof.

### 3. Capture screenshots

Save PNGs under `docs/features/<area>/assets/` with short names (for example `tab-glyph-proof.png`, `space-indent-proof.png`).

```bash
agent-browser --session markdown-editor open "http://localhost:5174/?fixture=<fixture>.md"
# scroll + activate the UI state (eval scrollIntoView + pointer events if click-by-text fails)
agent-browser --session markdown-editor screenshot docs/features/<area>/assets/<name>.png
```

**Done when:** you can describe what each image proves in one sentence.

### 4. Write the feature doc

Path: `docs/features/<area>/<feature-slug>.md`

Use this skeleton:

```markdown
# <Product> <feature title>

One paragraph: what it does and when it applies.

## Behavior

| Case | Expected |
| :--- | :--- |
| ... | ... |

## How to verify

Steps using the playground, extension, or CLI.

## Proof

![Short alt text](./assets/<proof>.png)

![Optional contrast case](./assets/<other-proof>.png)

## Implementation notes

Pointers to main source files (no need for a full map).
```

Link to fixtures with repo-relative paths (for example `../../tests/markdown/...`).

### 5. Proof in the user reply

When the user asked for images in chat, upload committed assets:

```bash
gh image docs/features/<area>/assets/<proof>.png
```

Paste the printed `![...](https://github.com/user-attachments/...)` markdown only (not a bare local path). Load `~/.agents/skills/tools/gh-image/SKILL.md` if `gh image` is missing or auth fails; stop and ask rather than using another host.

### 6. Changelog

Add to `CHANGELOG.md` under `## Unreleased` when the change is a fix, add, or user-visible change.

## Markdown Editor example

Reference implementation:

- Doc: [docs/features/markdownEditor/whitespace-glyphs.md](../../../docs/features/markdownEditor/whitespace-glyphs.md)
- Assets: `docs/features/markdownEditor/assets/tab-glyph-proof.png`, `space-indent-proof.png`
- Fixture: `docs/tests/markdown/keyboard-whitespace.md` (**Tab vs space glyphs** section with a literal tab)
- Contrast: `showcase.md` nested lists use **spaces** → middle dots are expected, not tab `>|`

## Anti-patterns

- Shipping only a chat screenshot without `docs/features/...` and `assets/` in the repo.
- Proving behavior on a fixture that does not match the claim (for example tab glyphs tested only on space-indented lists).
- Telling the user to verify; run agent-browser and attach proof yourself.
