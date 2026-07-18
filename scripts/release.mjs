#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const semverPattern = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

function run(command, options = {}) {
    console.log(`\n> ${command}`);
    execSync(command, { cwd: root, stdio: "inherit", ...options });
}

function readJson(path) {
    return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function writeJson(path, value) {
    writeFileSync(join(root, path), `${JSON.stringify(value, null, 4)}\n`);
}

function compareSemver(a, b) {
    const parse = (version) => version.split("-")[0].split(".").map(Number);
    const left = parse(a);
    const right = parse(b);

    for (let index = 0; index < 3; index += 1) {
        const diff = left[index] - right[index];
        if (diff !== 0) {
            return diff;
        }
    }

    return 0;
}

function nextVersion(current, bump) {
    const [major, minor, patch] = current.split("-")[0].split(".").map(Number);

    if (bump === "major") {
        return `${major + 1}.0.0`;
    }

    if (bump === "minor") {
        return `${major}.${minor + 1}.0`;
    }

    if (bump === "patch") {
        return `${major}.${minor}.${patch + 1}`;
    }

    return bump;
}

function fileChanged(path) {
    try {
        execSync(`git diff --quiet -- "${path}"`, { cwd: root, stdio: "ignore" });
        execSync(`git diff --cached --quiet -- "${path}"`, { cwd: root, stdio: "ignore" });
        return false;
    } catch {
        return true;
    }
}

function restorePackagingArtifacts() {
    const artifact = "media/mermaidPreview/vsCodeTheme.js";
    if (fileChanged(artifact)) {
        run(`git checkout -- "${artifact}"`);
    }
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const flags = new Set();
    const positionals = [];

    for (const arg of args) {
        if (arg === "--no-push") {
            flags.add("no-push");
            continue;
        }

        if (arg === "--no-commit") {
            flags.add("no-commit");
            continue;
        }

        if (arg === "--publish-only") {
            flags.add("publish-only");
            continue;
        }

        positionals.push(arg);
    }

    return { flags, versionArg: positionals[0] };
}

function assertChangelog(version) {
    const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    const section = `## ${version}`;

    if (!changelog.includes(section)) {
        throw new Error(
            `CHANGELOG.md is missing a "${section}" section. Update the changelog before running release.`,
        );
    }
}

function publishExtension() {
    const env = { ...process.env };
    delete env.VSCE_PAT;
    run("npx @vscode/vsce publish --azure-credential", { env });
}

function bumpVersions(version) {
    const packageJson = readJson("package.json");
    packageJson.version = version;
    writeJson("package.json", packageJson);

    const packageLock = readJson("package-lock.json");
    packageLock.version = version;
    packageLock.packages[""].version = version;
    writeJson("package-lock.json", packageLock);
}

function releaseFiles() {
    const files = ["package.json", "package-lock.json", "CHANGELOG.md"];

    if (fileChanged("README.md")) {
        files.push("README.md");
    }

    for (const path of [
        "scripts/release.mjs",
        ".cursor/skills/release/SKILL.md",
        "AGENTS.md",
    ]) {
        if (existsSync(join(root, path)) && fileChanged(path)) {
            files.push(path);
        }
    }

    return files;
}

function commitRelease(version) {
    const files = releaseFiles();
    run(`git add ${files.map((file) => `"${file}"`).join(" ")}`);
    run(`git commit -m "${version}"`);
}

const { flags, versionArg } = parseArgs(process.argv);

if (!versionArg) {
    console.error("Usage: npm run release -- <version|patch|minor|major> [--publish-only] [--no-commit] [--no-push]");
    process.exit(1);
}

const currentVersion = readJson("package.json").version;
const version = nextVersion(currentVersion, versionArg);
const publishOnly = flags.has("publish-only") || version === currentVersion;

if (!semverPattern.test(version)) {
    console.error(`Invalid semver: ${version}`);
    process.exit(1);
}

if (!publishOnly && compareSemver(version, currentVersion) <= 0) {
    console.error(`Version ${version} must be greater than current version ${currentVersion}`);
    process.exit(1);
}

if (publishOnly && version !== currentVersion) {
    console.error(`Publish-only requires package.json version ${version}, found ${currentVersion}`);
    process.exit(1);
}

console.log(`Releasing ${version}${publishOnly ? " (publish only)" : ""}`);

try {
    assertChangelog(version);

    if (!publishOnly) {
        bumpVersions(version);
    }

    run("npm run verify");
    run("npm run package:vsix");
    restorePackagingArtifacts();
    publishExtension();

    if (!flags.has("no-commit")) {
        commitRelease(version);
    } else {
        console.log("\nSkipped commit (--no-commit)");
    }

    if (!flags.has("no-push")) {
        run("git push");
    } else {
        console.log("\nSkipped push (--no-push)");
    }

    console.log(`\nReleased ${version} to the Marketplace`);
} catch (error) {
    console.error(`\nRelease failed: ${error.message}`);
    process.exit(1);
}
