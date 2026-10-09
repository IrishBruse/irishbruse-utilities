
import { InteractiveBrowserCredential } from "@azure/identity";
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { createAgentPrinter } from "./agent-stream.mjs";
import { changelogPrompt } from "./release-prompts.mjs";

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

function changelogHasVersion(version) {
    return readText("CHANGELOG.md").includes(`## ${version}`);
}

function changelogHistory() {
    const versions = [...readText("CHANGELOG.md").matchAll(/^## (\d+\.\d+\.\d+)/gm)].map((match) => match[1]);
    const previous = versions[0];
    if (!previous) {
        return execSync("git log --oneline -20", { cwd: root, encoding: "utf8" }).trim();
    }
    const rev = execSync(`git rev-list -n 1 --grep=^${previous}$ HEAD`, { cwd: root, encoding: "utf8" }).trim();
    if (rev.length === 0) {
        return execSync("git log --oneline -20", { cwd: root, encoding: "utf8" }).trim();
    }
    return execSync(`git log --oneline ${rev}..HEAD`, { cwd: root, encoding: "utf8" }).trim();
}

function runAgent(prompt) {
    console.log("\n> agent --print --output-format stream-json (release)");
    return new Promise((resolve, reject) => {
        const child = spawn("agent", [
            "--print",
            "--trust",
            "--force",
            "--model",
            "composer-2.5",
            "--output-format",
            "stream-json",
            "--stream-partial-output",
            prompt,
        ], {
            cwd: root,
            stdio: ["ignore", "pipe", "inherit"],
        });
        const printer = createAgentPrinter((chunk) => {
            process.stdout.write(chunk);
        }, { color: process.stdout.isTTY === true });
        let buffer = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (line.trim().length === 0) {
                    continue;
                }
                printer.writeLine(line);
            }
        });
        child.on("error", reject);
        child.on("close", (status) => {
            if (buffer.trim().length > 0) {
                printer.writeLine(buffer);
            }
            printer.finish();
            if (printer.failed) {
                reject(new Error(printer.failureMessage));
                return;
            }
            if (status !== 0) {
                reject(new Error("Command failed: agent --print (release)"));
                return;
            }
            resolve();
        });
    });
}

async function ensureChangelog(version) {
    if (changelogHasVersion(version)) {
        return;
    }

    await runAgent(changelogPrompt(version, changelogHistory()));
    assertChangelog(version);
}

async function prepareForStamp(version) {
    await ensureChangelog(version);
    run("npm run verify");
}

async function promptVersionBump(current) {
    const nextMinor = nextVersion(current, "minor");
    const nextPatch = nextVersion(current, "patch");
    const rl = createInterface({ input, output });

    console.log(`\nCurrent version is ${current}. Which release bump?`);
    console.log(`  1) Minor (${nextMinor})`);
    console.log(`  2) Patch (${nextPatch})`);
    const answer = (await rl.question("Enter 1, 2, or an explicit semver: ")).trim();
    rl.close();

    if (answer === "1") {
        return "minor";
    }

    if (answer === "2") {
        return "patch";
    }

    if (semverPattern.test(answer)) {
        return answer;
    }

    throw new Error(`Invalid version choice: ${answer}`);
}

async function promptPublish(version) {
    const rl = createInterface({ input, output });
    const answer = (await rl.question(`\nPublish ${version} to the VS Code Marketplace? [y/N] `)).trim();
    rl.close();
    return /^y(es)?$/i.test(answer);
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
        const outputText = execSync(command, {
            cwd: root,
            encoding: "utf8",
            env,
            stdio: ["inherit", "pipe", "pipe"],
        });

        if (outputText) {
            process.stdout.write(outputText);
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

    for (const path of ["scripts/release.mjs", "scripts/release-prompts.mjs", "AGENTS.md"]) {
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

function stampVersion(version) {
    bumpVersions(version);
    commitRelease(version);
    console.log(`\nStamped ${version}.`);
}

async function doPublish(version) {
    run("npm run verify");
    run("npm run package:vsix");
    await publishExtension();
    run("git push");
    console.log(`\nReleased ${version} to the Marketplace`);
}

async function main() {
    let { versionArg, publishOnly } = parseArgs(process.argv);
    const currentVersion = readJson("package.json").version;

    if (!versionArg) {
        versionArg = await promptVersionBump(currentVersion);
    }

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

    const packageSnapshot = !publishOnly && !isRetry ? readText("package.json") : null;
    const lockSnapshot = !publishOnly && !isRetry ? readText("package-lock.json") : null;
    let published = false;

    try {
        if (publishOnly && isRetry) {
            console.log(`Publishing ${version}`);
            await doPublish(version);
            published = true;
            return;
        }

        if (publishOnly && !isRetry) {
            console.log(`Preparing and publishing ${version}`);
            await prepareForStamp(version);
            stampVersion(version);
            await doPublish(version);
            published = true;
            return;
        }

        if (isRetry) {
            console.log(`Version ${version} already stamped. Run with --publish to deploy.`);
            return;
        }

        console.log(`Preparing ${version}`);
        await prepareForStamp(version);
        stampVersion(version);

        const approved = await promptPublish(version);
        if (approved) {
            await doPublish(version);
            published = true;
        } else {
            console.log(`Publish later: npm run release -- ${version} --publish`);
        }
    } catch (error) {
        if (!published && packageSnapshot !== null) {
            restoreWorkingTreeFiles(packageSnapshot, lockSnapshot);
            console.error("\nRestored package.json and package-lock.json to their pre-stamp versions.");
        }

        console.error(`\nRelease failed: ${error.message}`);
        process.exit(1);
    }
}

const hasVersionArg = parseArgs(process.argv).versionArg;
if (!hasVersionArg && process.argv.includes("--publish")) {
    console.error("Usage: npm run release [--] [<version|patch|minor|major>] [--publish]");
    process.exit(1);
}

main();
