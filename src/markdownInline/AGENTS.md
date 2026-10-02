# Inline Markdown package (`src/markdownInline`)

## Boundary

**`src/` is self-contained** except for Mermaid VS Code theme helpers.

TypeScript under `src/markdownInline/src` may import:

- other modules in `src/markdownInline/src`
- npm dependencies declared for this package
- `src/mermaidEditor/**` (Mermaid theme tokens and browser wiring only)

Do not import from `src/markdownEditor`, extension `host/` code, or `media/markdownInline`. Those layers load the **built** bundle from `media/markdownInline`; they are not source dependencies of this package.

Shared logic that the extension also needs (YAML front matter, skill front matter) lives under `src/markdownInline/src`; `markdownEditor` re-exports from this tree when it needs the same API.

## Layout

| Path | Role |
| --- | --- |
| `src/` | Editor webview implementation (Monaco, decorations, themes, mermaid, skill YAML) |
| `playground/` | Local Vite harness; may import `../src` only |
| `tests/<feature>/` | Samples under `fixtures/`, integration tests, regressions, and saved pictures |
| `support/` | Shared playground browser setup for those tests |
| `build.mjs` | Produces `media/markdownInline` |

Playground theme notes: `playground/AGENTS.md`.

## Verify

After changing `src/` or `playground/`, run `npm run test:markdown-inline-browser` from the repo root (see `.cursor/skills/verify-markdownInline/SKILL.md`).
