Packages are deep modules: see [src/markdownInline/README.md](./src/markdownInline/README.md) before adding or importing one.

Use `agent-browser` for testing markdownInline at http://localhost:5175/

## Vite+

The CLI is `vp`.
`vp dev` and `vp build` run Vite.
Docs are in `node_modules/vite-plus/docs` and at https://viteplus.dev/guide/.

`vp <name>` runs a built-in.
`vp run <name>` runs a `package.json` script or a `vite.config.ts` task.
`vp dev` and `vp run dev` are different commands.

`vp toolchain` shows tool versions. Add a tool name for one tool, for example `vp toolchain vite`.
`vp toolchain --global` ignores the local `vite-plus` package.
`vp why <package>` shows why that package is installed.

After a pull, run `vp install`.
`vp check` formats, lints, and type-checks.
`npm run lint` runs `vp lint` and `tsc --noEmit`.
It does not format.
`npm run test` runs the unit project only (`vp test run --project unit`).
`vp test` runs every Vitest project, including the browser project.
`npm run test:markdown-inline` runs the unit tests under `src/markdownInline`.
`npm run test:markdown-inline-browser` runs the Inline Markdown integration and regression tests.
`npm run verify` builds, runs the unit tests, and lints.
`npm run dev:markdown-inline` starts the playground.
`npm run check:markdown-inline` type-checks Inline Markdown and runs the browser tests.
`npm run e2e:markdown-inline` runs the playground end-to-end tests.
`npm run verify:markdown-inline` runs that check, the Inline Markdown unit tests, and the end-to-end tests.
If setup or the package manager looks wrong, run `vp env doctor`.
Include that output when you ask for help.
