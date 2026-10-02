import "../src/styles/editor.css";
import { mountInlineEditor } from "../src/editor";
import { hasYamlFrontMatter } from "../src/yamlFrontMatter";
import { isSkillMarkdownPath } from "../src/skillPath";

const DOCS_PREFIX = "../../../docs/tests/markdown/";
const TESTS_PREFIX = "../tests/";
const DEFAULT_FIXTURE = "playground.md";

const docsLoaders = import.meta.glob("../../../docs/tests/markdown/**/*.md", {
    query: "?raw",
    import: "default",
});

const testLoaders = import.meta.glob("../tests/**/fixtures/**/*.md", {
    query: "?raw",
    import: "default",
});

declare global {
    interface Window {
        __inlineMarkdown: ReturnType<typeof mountInlineEditor>;
    }
}

interface Fixture {
    id: string;
    load: () => Promise<string>;
    directory: "docs" | "tests";
}

function collectFixtures(
    loaders: Record<string, unknown>,
    prefix: string,
    directory: Fixture["directory"],
): Fixture[] {
    return Object.entries(loaders).map(([key, load]) => ({
        id: key.startsWith(prefix) ? key.slice(prefix.length) : key,
        load: load as () => Promise<string>,
        directory,
    }));
}

function openPlaygroundLink(href: string, baseUrl: string, fixtures: readonly Fixture[]): void {
    let resolved: URL;
    try {
        resolved = new URL(href, baseUrl);
    } catch {
        return;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
        return;
    }
    const name = decodeURIComponent(resolved.pathname.split("/").pop() ?? "");
    const fixture = fixtures.find((item) => item.id === name || item.id.endsWith(`/${name}`));
    if (fixture && name.endsWith(".md")) {
        const url = new URL(window.location.href);
        url.searchParams.set("fixture", fixture.id);
        window.location.assign(url);
        return;
    }
    window.open(resolved.href, "_blank", "noopener");
}

function fillFixtureSelect(select: HTMLSelectElement, fixtures: readonly Fixture[], selectedId: string): void {
    select.replaceChildren();
    for (const fixture of fixtures) {
        const option = document.createElement("option");
        option.value = fixture.id;
        option.textContent = fixture.id;
        select.append(option);
    }
    if (fixtures.some((fixture) => fixture.id === selectedId)) {
        select.value = selectedId;
    }
}

function setSourcePressed(source: HTMLElement, directory: Fixture["directory"]): void {
    for (const button of source.querySelectorAll<HTMLButtonElement>("button")) {
        button.setAttribute("aria-pressed", button.dataset.source === directory ? "true" : "false");
    }
}

function documentUrl(fixture: Fixture): string {
    const root = fixture.directory === "docs" ? __DOCS_MARKDOWN_FS__ : __INLINE_TESTS_FS__;
    return new URL(`/@fs${root}/${fixture.id}`, window.location.origin).href;
}

async function main(): Promise<void> {
    const byName = (left: Fixture, right: Fixture) => left.id.localeCompare(right.id);
    const docs = collectFixtures(docsLoaders, DOCS_PREFIX, "docs").sort((left, right) => {
        if (left.id === DEFAULT_FIXTURE) {
            return -1;
        }
        if (right.id === DEFAULT_FIXTURE) {
            return 1;
        }
        return byName(left, right);
    });
    const tests = collectFixtures(testLoaders, TESTS_PREFIX, "tests").sort(byName);
    const fixtures = [...docs, ...tests];
    const requested = new URLSearchParams(window.location.search).get("fixture") ?? DEFAULT_FIXTURE;
    const selected = fixtures.find((fixture) => fixture.id === requested) ?? fixtures.find((fixture) => fixture.id === DEFAULT_FIXTURE);
    const parent = document.querySelector("#editor");
    const select = document.querySelector("#fixture");
    const source = document.querySelector("#source");
    if (!(parent instanceof HTMLElement) || !(select instanceof HTMLSelectElement) || !(source instanceof HTMLElement) || !selected) {
        throw new Error("Inline markdown playground failed to start");
    }

    const groups = { docs, tests };
    fillFixtureSelect(select, groups[selected.directory], selected.id);
    setSourcePressed(source, selected.directory);
    source.addEventListener("click", (event) => {
        const button = event.target instanceof HTMLButtonElement ? event.target : null;
        const directory = button?.dataset.source === "tests" ? "tests" : button?.dataset.source === "docs" ? "docs" : undefined;
        if (!directory || directory === selected.directory) {
            return;
        }
        const next = groups[directory][0];
        if (!next) {
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set("fixture", next.id);
        window.location.assign(url);
    });
    select.addEventListener("change", () => {
        const url = new URL(window.location.href);
        url.searchParams.set("fixture", select.value);
        window.location.assign(url);
    });

    const text = await selected.load();
    const baseUrl = documentUrl(selected);
    window.__inlineMarkdown = mountInlineEditor(parent, {
        text,
        documentUrl: baseUrl,
        skillFrontMatter: isSkillMarkdownPath(selected.id) || hasYamlFrontMatter(text),
        onLink(href) {
            openPlaygroundLink(href, baseUrl, fixtures);
        },
    });
    if (selected.id === DEFAULT_FIXTURE) {
        const blankLine = text.indexOf("\n\n");
        window.__inlineMarkdown.setCursor(blankLine >= 0 ? blankLine + 1 : text.length);
    }
}

await main();
