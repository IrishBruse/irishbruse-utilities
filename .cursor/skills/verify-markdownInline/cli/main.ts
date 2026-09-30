import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const session = "verify-markdownInline";
const pageUrl = "http://127.0.0.1:5175/";
const cliDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(cliDir, "..", "..", "..", "..");
const mapPath = join(cliDir, "..", "feature-map.md");
const statePath = join(repoRoot, ".tmp", "verify-markdownInline", "state.json");
const readyFn = '!!document.querySelector("#editor .cm-content") && !!document.querySelector("#editor input[type=checkbox]") && !!document.querySelector("#editor img[alt]")';

const evidence: Record<string, string> = {
    "Rendered document": '(() => { const text = document.querySelector("#editor .cm-content")?.innerText ?? ""; return text.includes("Hello") && text.includes("A paragraph with"); })()',
    "Heading": '(() => (document.querySelector("#editor .cm-content")?.innerText ?? "").includes("# Hello"))()',
    "Bold": '(() => (document.querySelector("#editor .cm-content")?.innerText ?? "").includes("**bold**"))()',
    "Image": '(() => (document.querySelector("#editor .cm-content")?.innerText ?? "").includes("![Dot](dot.png)"))()',
    "Missing image": '(() => (document.querySelector("#editor .cm-content")?.innerText ?? "").includes("![Missing](does-not-exist.png)"))()',
    "Task": '(() => document.querySelector("#editor input[type=checkbox]")?.checked === true)()',
    "Code block": '(() => (document.querySelector("#editor .cm-content")?.innerText ?? "").includes("```ts"))()',
};

const discoverScript = `JSON.stringify((() => {
    const content = document.querySelector("#editor .cm-content");
    const text = content?.innerText ?? "";
    const role = content?.getAttribute("role");
    const reachOf = (el) => (el && el.accessKey ? el.accessKey : "none");
    const firstLine = text.split("\\n").map((line) => line.trim()).find((line) => line !== "") ?? "";
    const heading = firstLine.replace(/^#+\\s*/, "");
    const image = document.querySelector("#editor img[alt]");
    const box = document.querySelector("#editor input[type=checkbox]");
    const taskClass = box?.className.trim().split(/\\s+/).find((name) => name !== "") ?? "";
    const bold = [...document.querySelectorAll("#editor span")].some((el) => el.textContent === "bold");
    const missing = [...document.querySelectorAll("#editor span")].some((el) => el.textContent === "Missing");
    const code = text.includes("const value = 1;") || text.includes("const value = 1");
    return {
        "Rendered document": { reach: reachOf(content), activate: role ? "role=" + role : (content ? ".cm-content" : "") },
        "Heading": { reach: "none", activate: heading ? 'text="' + heading.replaceAll('"', '\\\\"') + '"' : "" },
        "Bold": { reach: "none", activate: bold ? 'text="bold"' : "" },
        "Image": { reach: reachOf(image), activate: image?.getAttribute("alt") ? 'alt="' + image.getAttribute("alt").replaceAll('"', '\\\\"') + '"' : "" },
        "Missing image": { reach: "none", activate: missing ? 'text="Missing"' : "" },
        "Task": { reach: reachOf(box), activate: taskClass ? "." + taskClass : (box ? 'input[type="checkbox"]' : "") },
        "Code block": { reach: "none", activate: code ? 'text="const value = 1;"' : "" },
    };
})())`;

interface Feature {
    name: string;
    does: string;
    reach: string;
    activate: string;
    from: string;
}

interface State {
    owned: boolean;
    pid?: number;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function readState(): State {
    try {
        const parsed = JSON.parse(readFileSync(statePath, "utf8")) as State;
        if (parsed && typeof parsed.owned === "boolean") {
            return parsed;
        }
    } catch {
        return { owned: false };
    }
    return { owned: false };
}

function writeState(state: State): void {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, `${JSON.stringify(state)}\n`);
}

function browser(args: string[], input?: string): string {
    const result = spawnSync("agent-browser", ["--session", session, ...args], {
        cwd: repoRoot,
        encoding: "utf8",
        input,
        stdio: input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        const detail = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
        throw new Error(detail || `agent-browser ${args.join(" ")} failed`);
    }
    return result.stdout ?? "";
}

function parseEval(stdout: string): unknown {
    const line = stdout.trim().split("\n").map((entry) => entry.trim()).filter((entry) => entry !== "").at(-1) ?? "";
    let value: unknown = JSON.parse(line);
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        } catch {
            return value;
        }
    }
    return value;
}

function evalJson(script: string): unknown {
    return parseEval(browser(["eval", "--stdin"], script));
}

async function pageReady(): Promise<boolean> {
    try {
        const response = await fetch(pageUrl, { signal: AbortSignal.timeout(2000) });
        return response.status === 200;
    } catch {
        return false;
    }
}

async function up(): Promise<void> {
    const state = readState();
    if (await pageReady()) {
        if (!state.owned) {
            writeState({ owned: false });
        }
        return;
    }
    const child = spawn("npm", ["run", "dev:markdown-inline"], {
        cwd: repoRoot,
        detached: true,
        stdio: "ignore",
    });
    child.unref();
    writeState({ owned: true, pid: child.pid });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        if (await pageReady()) {
            return;
        }
        await delay(250);
    }
    throw new Error("Playground did not return HTTP 200");
}

function down(): void {
    const state = readState();
    if (state.owned && state.pid) {
        try {
            process.kill(-state.pid, "SIGTERM");
        } catch {
            try {
                process.kill(state.pid, "SIGTERM");
            } catch {
                writeState({ owned: false });
            }
        }
    }
    writeState({ owned: false });
    spawnSync("agent-browser", ["--session", session, "close"], {
        cwd: repoRoot,
        encoding: "utf8",
    });
}

function readMap(): Feature[] {
    const text = readFileSync(mapPath, "utf8");
    const chunks = text.split(/^## /m).slice(1);
    return chunks.map((chunk) => {
        const [nameLine, ...rest] = chunk.split("\n");
        const name = nameLine.trim();
        const body = rest.join("\n");
        const field = (label: string): string => {
            const match = body.match(new RegExp(`^${label}: (.*)$`, "m"));
            if (!match?.[1]) {
                throw new Error(`Missing ${label} for ${name}`);
            }
            return match[1];
        };
        return {
            name,
            does: field("Does"),
            reach: field("Reach"),
            activate: field("Activate"),
            from: field("From"),
        };
    });
}

function featureNamed(name: string): Feature {
    const found = readMap().find((feature) => feature.name === name);
    if (!found) {
        throw new Error(`Unknown feature: ${name}`);
    }
    return found;
}

function quoted(spec: string, kind: string): string | undefined {
    const match = spec.match(new RegExp(`^${kind}="([^"]*)"$`));
    return match?.[1];
}

function activate(spec: string): void {
    const role = spec.match(/^role=(\S+)(?: name="([^"]*)")?$/);
    if (role?.[1]) {
        const args = ["find", "role", role[1], "click"];
        if (role[2]) {
            args.push("--name", role[2]);
        }
        browser(args);
        return;
    }
    const text = quoted(spec, "text");
    if (text !== undefined) {
        browser(["find", "text", text, "click", "--exact"]);
        return;
    }
    const alt = quoted(spec, "alt");
    if (alt !== undefined) {
        browser(["find", "alt", alt, "click"]);
        return;
    }
    if (spec.startsWith(".") || spec.startsWith("#") || spec.startsWith("input[")) {
        browser(["click", spec]);
        return;
    }
    throw new Error(`Unknown activate: ${spec}`);
}

async function waitFor(expression: string): Promise<void> {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
        try {
            if (evalJson(`JSON.stringify(!!(${expression}))`) === true) {
                return;
            }
        } catch {
            await delay(200);
            continue;
        }
        await delay(200);
    }
    throw new Error(`Timed out waiting for ${expression}`);
}

async function show(feature: Feature): Promise<void> {
    await up();
    browser(["open", pageUrl]);
    await waitFor(readyFn);
    if (feature.reach !== "none") {
        const inside = evalJson('JSON.stringify(document.activeElement?.getAttribute("role") === "textbox" || document.activeElement?.isContentEditable === true)') === true;
        if (!inside) {
            browser(["press", feature.reach]);
            return;
        }
    }
    activate(feature.activate);
}

function tracePath(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return join(repoRoot, ".tmp", "verify-markdownInline", "traces", `${slug}.json`);
}

function fail(name: string, error: unknown): never {
    console.error(name);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}

async function openFeature(name: string): Promise<void> {
    try {
        await show(featureNamed(name));
        console.log(name);
        console.log(pageUrl);
    } catch (error) {
        fail(name, error);
    }
}

async function trace(name: string): Promise<void> {
    const check = evidence[name];
    if (!check) {
        fail(name, new Error(`No evidence check for ${name}`));
    }
    let started = false;
    try {
        await up();
        browser(["open", pageUrl]);
        await waitFor(readyFn);
        browser(["profiler", "start"]);
        started = true;
        browser(["open", pageUrl]);
        await waitFor(readyFn);
        activate(featureNamed(name).activate);
        if (evalJson(`JSON.stringify(${check})`) !== true) {
            throw new Error(`${name} did not show its result`);
        }
        const path = tracePath(name);
        mkdirSync(dirname(path), { recursive: true });
        browser(["profiler", "stop", path]);
        started = false;
        console.log(path);
    } catch (error) {
        if (started) {
            try {
                const path = tracePath(name);
                mkdirSync(dirname(path), { recursive: true });
                browser(["profiler", "stop", path]);
            } catch {
                process.exitCode = 1;
            }
        }
        fail(name, error);
    }
}

async function mapCheck(): Promise<void> {
    await up();
    for (const feature of readMap()) {
        try {
            browser(["open", pageUrl]);
            await waitFor(readyFn);
            if (feature.reach !== "none") {
                browser(["press", feature.reach]);
            }
            activate(feature.activate);
        } catch (error) {
            fail(feature.name, error);
        }
    }
}

function rewriteMap(text: string, updates: Record<string, { reach: string; activate: string }>): string {
    const parts = text.split(/^## /m);
    const next = parts.map((part, index) => {
        if (index === 0) {
            return part;
        }
        const newline = part.indexOf("\n");
        const title = (newline === -1 ? part : part.slice(0, newline)).trim();
        const update = updates[title];
        if (!update) {
            return `## ${part}`;
        }
        const body = part
            .replace(/^Reach: .*$/m, `Reach: ${update.reach}`)
            .replace(/^Activate: .*$/m, `Activate: ${update.activate}`);
        return `## ${body}`;
    });
    return next.join("");
}

async function mapRefresh(): Promise<void> {
    await up();
    browser(["open", pageUrl]);
    await waitFor(readyFn);
    const found = evalJson(discoverScript) as Record<string, { reach?: string; activate?: string }>;
    const updates: Record<string, { reach: string; activate: string }> = {};
    for (const feature of readMap()) {
        const resolved = found[feature.name];
        if (!resolved?.reach || !resolved.activate) {
            fail(feature.name, new Error("Could not resolve Reach and Activate"));
        }
        updates[feature.name] = { reach: resolved.reach, activate: resolved.activate };
    }
    writeFileSync(mapPath, rewriteMap(readFileSync(mapPath, "utf8"), updates));
}

const [command, arg, extra] = process.argv.slice(2);

if (command === "up") {
    await up();
} else if (command === "down") {
    down();
} else if (command === "open" && arg) {
    await openFeature(arg);
} else if (command === "trace" && arg) {
    await trace(arg);
} else if (command === "map" && arg === "check" && !extra) {
    await mapCheck();
} else if (command === "map" && arg === "refresh" && !extra) {
    await mapRefresh();
} else {
    console.error("Usage: verify-markdownInline up | down | open <feature> | trace <feature> | map check | map refresh");
    process.exit(1);
}
