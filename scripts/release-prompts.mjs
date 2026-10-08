export function changelogPrompt(version) {
    return [
        `Release changelog for version ${version} in this repo.`,
        "Edit CHANGELOG.md and README.md only.",
        `If CHANGELOG.md lacks ## ${version}, add it immediately below ## Unreleased.`,
        "Draft bullets from git history since the previous ## version section and from any text under ## Unreleased.",
        "Changelog review rules:",
        "- One bullet per theme; merge small related changes.",
        "- Prefixes: **Add** / **Fix** / **Remove** / **Change**.",
        "- Drop refactors, tests, dev tooling, and agent churn unless users see it.",
        "- Patch releases: about 1–3 bullets; minor: about 3–8.",
        `Move reviewed bullets under ## ${version}; leave ## Unreleased empty.`,
        "Update README.md only for user-facing feature or command changes.",
        "Do not commit. Do not change package.json or package-lock.json version fields.",
    ].join("\n");
}

export function prepCommitPrompt() {
    return [
        "Prepare this repo for release stamp.",
        "Commit every pending change except edits to CHANGELOG.md, README.md, package.json, and package-lock.json.",
        "Do not bump version fields.",
        "Use the repo commit message style from recent git log.",
        "Stop when only those four release files differ from HEAD, or when there is nothing left to commit.",
    ].join("\n");
}
