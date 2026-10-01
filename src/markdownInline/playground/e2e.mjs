import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const playgroundDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(playgroundDir, "..");
const repoRoot = join(packageDir, "..", "..");
const shotDir = join(repoRoot, ".tmp", "markdown-inline");
const pageUrl = "http://127.0.0.1:5175/";

const SNAPSHOT_SCRIPT = `JSON.stringify({
    images: [...document.querySelectorAll("img.inline-md-image")].map((img) => img.currentSrc || img.src || img.getAttribute("src") || ""),
    heading: (() => {
        const node = document.querySelector(".inline-md-h1");
        return node ? node.textContent : null;
    })(),
    content: (() => {
        const node = document.querySelector(".view-lines");
        return node ? node.innerText : null;
    })(),
    fallbacks: [...document.querySelectorAll(".inline-md-image-fallback")].map((node) => node.textContent || ""),
})`;

const PLACE_CARET_SCRIPT = `(() => {
    try {
        const handle = window.__inlineMarkdown;
        const heading = document.querySelector(".inline-md-h1");
        if (!handle || typeof handle.setCursor !== "function" || !heading) {
            return JSON.stringify({
                ok: false,
                reason: !handle ? "missing __inlineMarkdown" : "missing .inline-md-h1",
            });
        }
        handle.setCursor(2);
        handle.focus();
        return JSON.stringify({ ok: true, pos: 2 });
    } catch (error) {
        return JSON.stringify({
            ok: false,
            reason: error instanceof Error ? error.message : String(error),
        });
    }
})()`;

const RAW_HEADING_FN = 'document.querySelector(".inline-md-h1") != null && document.querySelector(".view-lines") != null && document.querySelector(".view-lines").innerText.includes("#")';

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}


function fail(message, page) {
    console.error(message);
    console.error("Page showed:");
    console.error(typeof page === "string" ? page : JSON.stringify(page, null, 2));
    const error = new Error(message);
    error.pagePrinted = true;
    throw error;
}


function agentBrowser(args, input) {
    const result = spawnSync("agent-browser", ["--session", "markdown-inline", ...args], {
        cwd: repoRoot,
        encoding: "utf8",
        input,
        stdio: input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
        throw new Error(`agent-browser ${args.join(" ")} failed (${result.status}): ${detail}`);
    }
    return result.stdout ?? "";
}

function closeBrowser() {
    const result = spawnSync("agent-browser", ["--session", "markdown-inline", "close"], {
        cwd: repoRoot,
        encoding: "utf8",
    });
    if (result.error) {
        console.error(result.error.message);
        return;
    }
    if (result.status !== 0) {
        const detail = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
        if (detail) {
            console.error(detail);
        }
    }
}


function parsePage(stdout) {
    const text = stdout.trim();
    const candidates = [text];
    const lastLine = text.split("\n").filter((line) => line.trim() !== "").at(-1);
    if (lastLine && lastLine !== text) {
        candidates.push(lastLine);
    }
    for (const candidate of candidates) {
        try {
            let value = JSON.parse(candidate);
            if (typeof value === "string") {
                value = JSON.parse(value);
            }
            if (value && typeof value === "object" && Array.isArray(value.images) && Array.isArray(value.fallbacks)) {
                return value;
            }
        } catch {
            
        }
    }
    return null;
}

function readPage() {
    const stdout = agentBrowser(["eval", "--stdin"], SNAPSHOT_SCRIPT);
    const page = parsePage(stdout);
    if (!page) {
        fail("Could not read the playground page.", stdout.trim());
    }
    return page;
}

function safeReadPage() {
    try {
        return readPage();
    } catch (error) {
        if (error && error.pagePrinted) {
            throw error;
        }
        return error instanceof Error ? error.message : String(error);
    }
}


function stopVite(vite) {
    if (vite.exitCode !== null || vite.signalCode !== null || !vite.pid) {
        return;
    }
    try {
        process.kill(-vite.pid, "SIGTERM");
    } catch {
        try {
            vite.kill("SIGTERM");
        } catch {
            
        }
    }
}

function startVite() {
    const vite = spawn(
        "npx",
        ["vite", "--config", "playground/vite.config.ts", "--port", "5175", "--strictPort"],
        {
            cwd: packageDir,
            stdio: "pipe",
            detached: true,
        },
    );
    let log = "";
    const append = (chunk) => {
        log = `${log}${chunk.toString()}`.slice(-20_000);
    };
    vite.stdout?.on("data", append);
    vite.stderr?.on("data", append);
    const ready = new Promise((resolve, reject) => {
        vite.once("spawn", () => {
            vite.off("error", reject);
            resolve(undefined);
        });
        vite.once("error", reject);
    });
    return { vite, ready, log: () => log };
}


async function waitForPlayground(server) {
    await server.ready;
    const deadline = Date.now() + 20_000;
    let last = "no response";
    while (Date.now() < deadline) {
        if (server.vite.exitCode !== null) {
            throw new Error(`Vite exited with code ${server.vite.exitCode} before HTTP 200.\n${server.log()}`);
        }
        try {
            const response = await fetch(pageUrl, { signal: AbortSignal.timeout(2000) });
            if (response.status === 200) {
                return;
            }
            last = `HTTP ${response.status}`;
        } catch (error) {
            last = error instanceof Error ? error.message : String(error);
        }
        await delay(250);
    }
    throw new Error(`Playground did not return HTTP 200 within 20s (${last}).\n${server.log()}`);
}


function headingStartsWithHash(page) {
    if (typeof page.content !== "string") {
        return true;
    }
    const firstLine = page.content.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
    return firstLine.trimStart().startsWith("#");
}


function isRawHeading(page) {
    return page.heading !== null && typeof page.content === "string" && page.content.includes("#");
}


function assertRendered(page) {
    const problems = [];
    if (!page.images.some((src) => src.includes("dot.png"))) {
        problems.push('Expected an img.inline-md-image whose src includes "dot.png".');
    }
    if (!String(page.heading ?? "").includes("Hello")) {
        problems.push('Expected .inline-md-h1 text to include "Hello".');
    }
    if (headingStartsWithHash(page)) {
        problems.push('Expected the heading hash to be hidden (.view-lines innerText should not include "#" at the start of the heading).');
    }
    if (problems.length > 0) {
        fail(problems.join("\n"), page);
    }
}


function assertRawHeading(page) {
    const problems = [];
    if (typeof page.content !== "string" || !page.content.includes("#")) {
        problems.push('Expected .view-lines innerText to include "#".');
    }
    if (!String(page.heading ?? "").includes("Hello")) {
        problems.push("Expected .inline-md-h1 to keep the heading color on the raw line.");
    }
    if (problems.length > 0) {
        fail(problems.join("\n"), page);
    }
}


function assertMissingImage(page) {
    if (!page.fallbacks.some((text) => text.includes("Missing"))) {
        fail('Expected a .inline-md-image-fallback whose text includes "Missing".', page);
    }
}

async function revealRawHeading() {
    let clickMessage = "";
    try {
        agentBrowser(["click", ".inline-md-h1"]);
    } catch (error) {
        clickMessage = error instanceof Error ? error.message : String(error);
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
        if (isRawHeading(readPage())) {
            return;
        }
        await delay(100);
    }

    const caret = agentBrowser(["eval", "--stdin"], PLACE_CARET_SCRIPT).trim();
    try {
        agentBrowser(["wait", "--fn", RAW_HEADING_FN]);
    } catch (error) {
        const detail = [
            "Heading did not switch to raw source.",
            clickMessage ? `click: ${clickMessage}` : "",
            `caret: ${caret}`,
            error instanceof Error ? error.message : String(error),
        ].filter((line) => line !== "").join("\n");
        fail(detail, safeReadPage());
    }
}

async function exercise() {
    mkdirSync(shotDir, { recursive: true });
    agentBrowser(["open", pageUrl]);
    agentBrowser(["wait", "--fn", 'document.querySelector("img.inline-md-image")']);
    agentBrowser(["screenshot", join(shotDir, "rendered.png")]);
    assertRendered(readPage());
    await revealRawHeading();
    assertRawHeading(readPage());
    agentBrowser(["screenshot", join(shotDir, "raw-heading.png")]);
    assertMissingImage(readPage());
}

async function main() {
    const server = startVite();
    let failed = false;
    try {
        await waitForPlayground(server);
        await exercise();
    } catch (error) {
        failed = true;
        if (!error || !error.pagePrinted) {
            console.error(error instanceof Error ? error.message : String(error));
        }
    } finally {
        stopVite(server.vite);
        closeBrowser();
    }
    if (failed) {
        process.exit(1);
    }
    process.exit(0);
}

await main();
