import "../src/styles/editor.css";
import { mountInlineEditor } from "../src/editor";
import { hasYamlFrontMatter } from "../src/yamlFrontMatter";
import { isSkillMarkdownPath } from "../src/skillPath";

const DOCS_PREFIX = "../../../docs/tests/markdown/";
const DEFAULT_FIXTURE = "playground.md";

const fixtureLoaders = import.meta.glob("../../../docs/tests/markdown/**/*.md", {
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
}

function fixtureId(globKey: string): string {
    return globKey.startsWith(DOCS_PREFIX) ? globKey.slice(DOCS_PREFIX.length) : globKey;
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

function documentUrl(id: string): string {
    return new URL(`/@fs${__DOCS_MARKDOWN_FS__}/${id}`, window.location.origin).href;
}

async function main(): Promise<void> {
    const fixtures: Fixture[] = Object.entries(fixtureLoaders)
        .map(([key, load]) => ({ id: fixtureId(key), load: load as () => Promise<string> }))
        .sort((left, right) => {
            if (left.id === DEFAULT_FIXTURE) {
                return -1;
            }
            if (right.id === DEFAULT_FIXTURE) {
                return 1;
            }
            return left.id.localeCompare(right.id);
        });
    const requested = new URLSearchParams(window.location.search).get("fixture") ?? DEFAULT_FIXTURE;
    const selected = fixtures.find((fixture) => fixture.id === requested) ?? fixtures.find((fixture) => fixture.id === DEFAULT_FIXTURE);
    const parent = document.querySelector("#editor");
    const select = document.querySelector("#fixture");
    if (!(parent instanceof HTMLElement) || !(select instanceof HTMLSelectElement) || !selected) {
        throw new Error("Inline markdown playground failed to start");
    }

    for (const fixture of fixtures) {
        const option = document.createElement("option");
        option.value = fixture.id;
        option.textContent = fixture.id;
        select.append(option);
    }
    select.value = selected.id;
    select.addEventListener("change", () => {
        const url = new URL(window.location.href);
        url.searchParams.set("fixture", select.value);
        window.location.assign(url);
    });

    const text = await selected.load();
    const baseUrl = documentUrl(selected.id);
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
