export function changelogPrompt(version, history) {
    return [
        `Write ## ${version} in CHANGELOG.md. Be fast. Stop when that section is saved.`,
        "Read CHANGELOG.md only. Do not open, search, or read any other file.",
        "Do not run git. The history since the previous release is below.",
        `If ## ${version} is missing, add it immediately below ## Unreleased.`,
        "One bullet per theme. Prefixes: **Add** / **Fix** / **Remove** / **Change**.",
        "Drop refactors, tests, dev tooling, and agent churn unless users see it.",
        "Patch: 1–3 bullets. Minor: 3–8 bullets.",
        `Move reviewed bullets under ## ${version}. Leave ## Unreleased empty.`,
        "Do not edit README.md. Do not commit. Do not change package.json or package-lock.json.",
        "",
        "Git history:",
        history.length > 0 ? history : "(no commits since the previous release)",
    ].join("\n");
}
