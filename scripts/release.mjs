#!/usr/bin/env node
import { InteractiveBrowserCredential } from "@azure/identity";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const semverPattern = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const marketplaceScope = "499b84ac-1321-427f-aa17-267ca6975798/.default";

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

function readText(path) {
    return readFileSync(join(root, path), "utf8");
}

function restoreWorkingTreeFiles(packageSnapshot, lockSnapshot) {
    if (packageSnapshot !== null) {
        writeFileSync(join(root, "package.json"), packageSnapshot);
    }

    if (lockSnapshot !== null) {
        writeFileSync(join(root, "package-lock.json"), lockSnapshot);
    }

    const artifact = "media/mermaidPreview/vsCodeTheme.js";
    if (fileChanged(artifact)) {
        execSync(`git checkout -- "${artifact}"`, { cwd: root, stdio: "ignore" });
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
    const publishOnly = args.includes("--publish");
    const versionArg = args.find((arg) => !arg.startsWith("--")) ?? null;
    return { versionArg, publishOnly };
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

function hasServicePrincipalAuth() {
    return Boolean(
        process.env.AZURE_CLIENT_ID &&
            process.env.AZURE_CLIENT_SECRET &&
            process.env.AZURE_TENANT_ID,
    );
}

async function getBrowserOAuthToken() {
    console.log(
        [
            "",
            "Opening a browser for Marketplace sign-in.",
            "Choose the personal Microsoft account that owns the publisher.",
        ].join("\n"),
    );

    const credential = new InteractiveBrowserCredential({
        clientId: "04b07795-8ddb-461a-bbee-02f9e1bf7b46",
        tenantId: process.env.AZURE_TENANT_ID ?? "organizations",
        loginHint: process.env.MARKETPLACE_LOGIN_HINT,
    });

    const token = await credential.getToken(marketplaceScope);
    if (!token?.token) {
        throw new Error("Marketplace browser sign-in did not return an access token.");
    }

    return token.token;
}

function runVscePublish(env) {
    const command = hasServicePrincipalAuth()
        ? "npx @vscode/vsce publish --azure-credential"
        : "npx @vscode/vsce publish";

    console.log(`\n> ${command}`);

    try {
        const output = execSync(command, {
            cwd: root,
            encoding: "utf8",
            env,
            stdio: ["inherit", "pipe", "pipe"],
        });

        if (output) {
            process.stdout.write(output);
        }
    } catch (error) {
        if (error.stdout) {
            process.stdout.write(error.stdout);
        }

        if (error.stderr) {
            process.stderr.write(error.stderr);
        }

        throw new Error("Publish failed");
    }
}

async function publishExtension() {
    const env = hasServicePrincipalAuth()
        ? process.env
        : { ...process.env, VSCE_PAT: await getBrowserOAuthToken() };

    runVscePublish(env);
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

    for (const path of ["scripts/release.mjs", ".cursor/skills/release/SKILL.md", "AGENTS.md"]) {
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

const { versionArg, publishOnly } = parseArgs(process.argv);

if (!versionArg) {
    console.error("Usage: npm run release -- <version|patch|minor|major> [--publish]");
    process.exit(1);
}

const currentVersion = readJson("package.json").version;
const version = nextVersion(currentVersion, versionArg);
const isRetry = versionArg === version && compareSemver(version, currentVersion) === 0;

if (!semverPattern.test(version)) {
    console.error(`Invalid semver: ${version}`);
    process.exit(1);
}

if (!isRetry && compareSemver(version, currentVersion) <= 0) {
    console.error(`Version ${version} must be greater than current version ${currentVersion}`);
    process.exit(1);
}

console.log(
    isRetry
        ? publishOnly
            ? `Publishing ${version}`
            : `Version ${version} already stamped. Run with --publish to deploy.`
        : `Stamping ${version}`,
);

const packageSnapshot = !publishOnly && !isRetry ? readText("package.json") : null;
const lockSnapshot = !publishOnly && !isRetry ? readText("package-lock.json") : null;
let published = false;

try {
    assertChangelog(version);

    if (!publishOnly) {
        if (isRetry) {
            process.exit(0);
        }

        bumpVersions(version);
        commitRelease(version);
        console.log(`\nStamped ${version}. Approve publish, then: npm run release -- ${version} --publish`);
        process.exit(0);
    }

    if (!isRetry) {
        throw new Error(
            `package.json is ${currentVersion}, expected ${version}. Stamp first: npm run release -- ${version}`,
        );
    }

    run("npm run verify");
    run("npm run package:vsix");
    restorePackagingArtifacts();
    await publishExtension();
    published = true;
    run("git push");
    console.log(`\nReleased ${version} to the Marketplace`);
} catch (error) {
    if (!published && packageSnapshot !== null) {
        restoreWorkingTreeFiles(packageSnapshot, lockSnapshot);
        console.error("\nRestored package.json and package-lock.json to their pre-stamp versions.");
    }

    console.error(`\nRelease failed: ${error.message}`);
    process.exit(1);
}
