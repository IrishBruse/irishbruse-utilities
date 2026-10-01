import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMap, validateSuite, type Feature } from "./suite.ts";

const session = "verify-markdownInline";
const pageUrl = "http://127.0.0.1:5175/";
const cliDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(cliDir, "..", "..", "..", "..");
const mapPath = join(cliDir, "..", "feature-map.md");
const statePath = join(repoRoot, ".tmp", "verify-markdownInline", "state.json");
const pageText = '(document.querySelector("#editor .view-lines")?.innerText ?? "").replaceAll("\\u00a0", " ")';
const readyFn = `!!document.querySelector("#editor .inline-md-h1") && !!document.querySelector("#editor .inline-md-strong") && !!document.querySelector("#editor input[type=checkbox]") && !!document.querySelector("#editor img[alt]") && !!document.querySelector("#editor .inline-md-code-hit") && !!document.querySelector("#editor .inline-md-table") && !!document.querySelector("#editor .inline-md-hr")`;

const evidence: Record<string, string> = {
    "Rendered document": `(() => { const text = ${pageText}; return text.includes("Hello") && text.includes("A paragraph with") && text.includes("title: Playground"); })()`,
    "YAML front matter": `(() => { const text = ${pageText}; return text.includes("title: Playground") && text.includes("draft: false"); })()`,
    "Heading": `(() => (${pageText}).includes("# Hello"))()`,
    "Bold": `(() => (${pageText}).includes("**bold**"))()`,
    "Italic": `(() => (${pageText}).includes("*italic*"))()`,
    "Strikethrough": `(() => (${pageText}).includes("~~strike~~"))()`,
    "Inline code": `(() => (${pageText}).includes("\`inline code\`"))()`,
    "Link": `(() => (${pageText}).includes("[Example link](https://example.com)"))()`,
    "Blockquote": `(() => (${pageText}).includes("> Quote line."))()`,
    "Thematic break": `(() => (${pageText}).split("\\n").some((line) => line.trim() === "---"))()`,
    "Image": `(() => (${pageText}).includes("![Dot](https://www.w3.org/Icons/valid-xhtml10)"))()`,
    "Missing image": `(() => (${pageText}).includes("![Missing](does-not-exist.png)"))()`,
    "List": `(() => { const fold = (value) => (value ?? "").replaceAll("\\u00a0", " "); const lines = [...document.querySelectorAll("#editor .view-line")]; const line = lines.find((el) => fold(el.textContent).includes("Wrapped list item")); const wrap = lines.find((el) => fold(el.textContent).trim() === "marker."); const lane = document.querySelector("#editor .inline-md-list-bullet"); const word = line ? [...line.querySelectorAll("span")].find((span) => fold(span.textContent).startsWith("Wrapped")) : undefined; if (!line || !wrap || !lane || !word) return false; const margin = document.querySelector("#editor .margin")?.getBoundingClientRect(); const laneBox = lane.getBoundingClientRect(); const mark = getComputedStyle(lane, "::before").content; if (!margin || !mark.includes("•")) return false; const aligned = Math.abs(word.getBoundingClientRect().left - wrap.getBoundingClientRect().left) <= 1; const inGutter = laneBox.width > 8 && laneBox.height > 8 && laneBox.left >= margin.left - 1 && laneBox.right <= margin.right + 1 && laneBox.right <= word.getBoundingClientRect().left + 1; return aligned && inGutter; })()`,
    "Task": `(() => { const box = document.querySelector("#editor input[type=checkbox]"); const taskLine = [...document.querySelectorAll("#editor .view-line")].find((line) => line.textContent?.includes("Task")); const spacer = taskLine?.querySelector(".inline-md-task-spacer"); const boxRect = box?.getBoundingClientRect(); const spacerRect = spacer?.getBoundingClientRect(); const aligned = !!(boxRect && spacerRect && Math.abs(boxRect.left - spacerRect.left) <= 2 && Math.abs(boxRect.top - spacerRect.top) <= 6); return box?.checked === true && !!taskLine && !taskLine.querySelector(".inline-md-bullet") && aligned; })()`,
    "Code block": `(() => (${pageText}).includes("\`\`\`ts"))()`,
    "Table": `(() => { const text = ${pageText}; return document.querySelector("#editor .inline-md-table") == null && text.includes("Source hint") && text.includes("|"); })()`,
    "Mermaid": `(() => {
        const api = window.__inlineMarkdown;
        if (!api?.getDocument || !api.setCursor) return false;
        const at = api.getDocument().indexOf("flowchart");
        if (at < 0) return false;
        const button = document.querySelector("#editor .inline-md-mermaid-open-preview");
        const style = button ? getComputedStyle(button) : null;
        const underlined = !!style && style.textDecorationLine.includes("underline");
        const svg = () => !!document.querySelector("#editor .inline-md-mermaid-diagram svg");
        const state = window.__mermaidProof ?? "preview";
        if (state === "preview") {
            if (!button || !underlined || !svg()) return false;
            window.__mermaidProof = "raw";
            api.setCursor(at + 2);
            return false;
        }
        if (state === "raw") {
            if (svg() || button) return false;
            window.__mermaidProof = "back";
            api.setCursor(0);
            return false;
        }
        return svg();
    })()`,
};

const discoverScript = `JSON.stringify((() => {
    const content = document.querySelector("#editor .view-lines");
    const text = content?.innerText ?? "";
    const reachOf = (el) => (el && el.accessKey ? el.accessKey : "none");
    const headingLine = text.split("\\n").find((line) => /^#\\s/.test(line.trim())) ?? "";
    const heading = headingLine.replace(/^#+\\s*/, "").trim();
    const image = document.querySelector("#editor img[alt]");
    const box = document.querySelector("#editor input[type=checkbox]");
    const taskClass = box?.className.trim().split(/\\s+/).find((name) => name !== "") ?? "";
    const spanText = (value) => [...document.querySelectorAll("#editor span")].some((el) => el.textContent === value);
    const table = document.querySelector("#editor .inline-md-table");
    const hr = document.querySelector("#editor .inline-md-hr");
    return {
        "Rendered document": { reach: "none", activate: "offset=49" },
        "YAML front matter": { reach: "none", activate: "offset=49" },
        "Heading": { reach: "none", activate: "offset=42" },
        "Bold": { reach: "none", activate: "offset=67" },
        "Italic": { reach: "none", activate: "offset=77" },
        "Strikethrough": { reach: "none", activate: "offset=87" },
        "Inline code": { reach: "none", activate: "offset=103" },
        "Link": { reach: "none", activate: "offset=119" },
        "Blockquote": { reach: "none", activate: "offset=157" },
        "Thematic break": { reach: "none", activate: "offset=171" },
        "Image": { reach: reachOf(image), activate: image?.getAttribute("alt") ? 'alt="' + image.getAttribute("alt").replaceAll('"', '\\\\"') + '"' : "" },
        "Missing image": { reach: "none", activate: spanText("Missing") ? 'text="Missing"' : "" },
        "Task": { reach: reachOf(box), activate: taskClass ? "." + taskClass : (box ? 'input[type="checkbox"]' : "") },
        "Code block": { reach: "none", activate: "offset=275" },
        "Table": { reach: "none", activate: "offset=360" },
        "Mermaid": { reach: "none", activate: document.querySelector("#editor .inline-md-mermaid-open-preview") ? ".inline-md-mermaid-open-preview" : "" },
    };
})())`;

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
    return parseMap(readFileSync(mapPath, "utf8"));
}

function suiteProblems(): string[] {
    return validateSuite(readMap(), Object.keys(evidence));
}

function featureNamed(name: string): Feature {
    const found = readMap().find((feature) => feature.name === name);
    if (!found) {
        throw new Error(`Unknown feature: ${name}`);
    }
    return found;
}

function featureChain(target: Feature): Feature[] {
    const byName = new Map(readMap().map((feature) => [feature.name, feature]));
    const chain: Feature[] = [];
    let current: Feature | undefined = target;
    while (current && current.from !== "entry") {
        const parent = byName.get(current.from);
        if (!parent) {
            throw new Error(`Unknown parent feature: ${current.from}`);
        }
        chain.unshift(parent);
        current = parent;
    }
    chain.push(target);
    return chain;
}

function runReach(feature: Feature): void {
    if (feature.reach === "none") {
        return;
    }
    const inside = evalJson('JSON.stringify(document.activeElement?.getAttribute("role") === "textbox" || document.activeElement?.isContentEditable === true)') === true;
    if (!inside) {
        browser(["press", feature.reach]);
    }
}

function quoted(spec: string, kind: string): string | undefined {
    const match = spec.match(new RegExp(`^${kind}="([^"]*)"$`));
    return match?.[1];
}

async function clickInView(spec: string): Promise<void> {
    const deadline = Date.now() + 4_000;
    const selector = JSON.stringify(spec);
    while (Date.now() < deadline) {
        const ready = evalJson(`JSON.stringify((() => {
            const el = document.querySelector(${selector});
            if (!el) return false;
            el.scrollIntoView({ block: "center" });
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
        })())`) === true;
        if (ready) {
            browser(["click", spec]);
            return;
        }
        await delay(50);
    }
    throw new Error(`Locator is not in view: ${spec}`);
}

async function activate(spec: string): Promise<void> {
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
    if (spec.startsWith("offset=")) {
        const offset = Number.parseInt(spec.slice("offset=".length), 10);
        if (!Number.isFinite(offset)) {
            throw new Error(`Unknown activate: ${spec}`);
        }
        evalJson(`(() => { window.__inlineMarkdown?.setCursor(${offset}); return true; })()`);
        return;
    }
    if (spec.startsWith(".") || spec.startsWith("#") || spec.startsWith("input[")) {
        await clickInView(spec);
        return;
    }
    throw new Error(`Unknown activate: ${spec}`);
}

async function waitFor(expression: string, timeoutMs = 8_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
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
    throw new Error("timed out");
}

function snapshot(): string {
    const value = evalJson(`JSON.stringify((() => {
        const text = ${pageText};
        return text.slice(0, 500);
    })())`);
    return typeof value === "string" ? value : JSON.stringify(value);
}

async function reachFeature(feature: Feature): Promise<void> {
    browser(["open", pageUrl]);
    await waitFor(readyFn);
    const steps = featureChain(feature).filter((step, index, chain) => !(step.sequence && index === chain.length - 1));
    for (const step of steps) {
        runReach(step);
        await activate(step.activate);
    }
}

async function show(feature: Feature): Promise<void> {
    await up();
    await reachFeature(feature);
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
        await reachFeature(featureNamed(name));
        await waitFor(check, featureNamed(name).sequence ? 20_000 : 8_000);
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
        console.error(snapshot());
        fail(name, error);
    }
}

async function mapCheck(): Promise<void> {
    await up();
    for (const feature of readMap()) {
        try {
            browser(["open", pageUrl]);
            await waitFor(readyFn);
            for (const step of featureChain(feature)) {
                runReach(step);
                await activate(step.activate);
            }
        } catch (error) {
            console.error(snapshot());
            fail(feature.name, error);
        }
    }
}

function validate(): void {
    const problems = suiteProblems();
    if (problems.length === 0) {
        return;
    }
    for (const problem of problems) {
        console.error(problem);
    }
    process.exit(1);
}

async function regress(): Promise<void> {
    validate();
    await up();
    for (const feature of readMap()) {
        const check = evidence[feature.name];
        try {
            await reachFeature(feature);
            await waitFor(check, feature.sequence ? 20_000 : 8_000);
            console.log(feature.name);
        } catch (error) {
            console.error(feature.name);
            console.error("regression failed");
            try {
                console.error(snapshot());
            } catch {
                process.exitCode = 1;
            }
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
} else if (command === "validate" && !arg) {
    validate();
} else if (command === "regress" && !arg) {
    await regress();
} else {
    console.error("Usage: verify-markdownInline up | down | open <feature> | trace <feature> | map check | map refresh | validate | regress");
    process.exit(1);
}
