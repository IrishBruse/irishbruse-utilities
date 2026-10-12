export function changelogInstructions(version, history) {
    return [
        `CHANGELOG.md is missing a "## ${version}" section.`,
        `Add it directly below "## Unreleased", then run the release again.`,
        "",
        "One bullet per theme. Prefixes: **Add** / **Fix** / **Remove** / **Change**.",
        "Drop refactors, tests, dev tooling, and agent churn unless users see it.",
        "Patch: 1-3 bullets. Minor: 3-8 bullets.",
        "Do not edit README.md, package.json, or package-lock.json.",
        "",
        "Git history since the previous release:",
        history.length > 0 ? history : "(no commits since the previous release)",
    ].join("\n");
}
