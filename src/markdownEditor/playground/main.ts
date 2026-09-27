import {
    encodeWebviewInitialState,
    isSkillMarkdownPath,
    prefixMarkdownForFastOpen,
    skillFolderNameFromPath,
} from "../host/webviewInitialState";
import { MockMarkdownDocument, handlePlaygroundMessage, type PlaygroundSession } from "./mockHost";
import {
    coalesceMarkdownEdits,
    diffMarkdown,
    selectionFromViewState,
    type MarkdownEdit,
    type SourceSelection,
} from "./sourceInspector";
import { mountSourceInspector } from "./sourceInspectorView";
import { installWorkspaceSplit } from "./workspaceSplit";

const READONLY_KEY = "ib-utilities.markdownEditor.readonly";
const FIXTURE_PREFIX = "../../../docs/tests/markdown/";
const DEFAULT_FIXTURE = "showcase.md";

const fixtureLoaders = import.meta.glob("../../../docs/tests/markdown/**/*.md", {
    query: "?raw",
    import: "default",
});

interface VsCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

function fixtureId(globKey: string): string {
    return globKey.startsWith(FIXTURE_PREFIX) ? globKey.slice(FIXTURE_PREFIX.length) : globKey;
}

function readReadonly(): boolean {
    return localStorage.getItem(READONLY_KEY) === "true";
}

function persistReadonly(message: unknown): void {
    if (!message || typeof message !== "object") {
        return;
    }
    const record = message as Record<string, unknown>;
    if (record.type !== "setReadonly" || typeof record.readonly !== "boolean") {
        return;
    }
    localStorage.setItem(READONLY_KEY, record.readonly ? "true" : "false");
}

function openHttpLink(message: unknown): void {
    if (!message || typeof message !== "object") {
        return;
    }
    const record = message as Record<string, unknown>;
    if (record.type !== "openLink" || typeof record.href !== "string" || !/^https?:\/\//i.test(record.href)) {
        return;
    }
    window.open(record.href, "_blank", "noopener");
}

function installVsCodeApi(postMessage: (message: unknown) => void, onViewState: (state: unknown) => void): void {
    let viewState: unknown;
    const api: VsCodeApi = {
        postMessage,
        getState: () => viewState,
        setState: (state: unknown) => {
            viewState = state;
            onViewState(state);
            return state;
        },
    };
    Object.assign(globalThis, { acquireVsCodeApi: () => api });
}

function writeBootMeta(messageSecret: string, initialState: string): void {
    const secret = document.createElement("meta");
    secret.name = "vscode-markdown-editor-message-secret";
    secret.content = messageSecret;
    const state = document.createElement("meta");
    state.id = "vscode-markdown-editor-initial-state";
    state.content = initialState;
    document.head.append(secret, state);
}

function postToEditor(messageSecret: string, message: object): void {
    window.dispatchEvent(new MessageEvent("message", { data: { ...message, messageSecret } }));
}

async function main(): Promise<void> {
    const fixtures = Object.entries(fixtureLoaders)
        .map(([key, load]) => ({ id: fixtureId(key), load: load as () => Promise<string> }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const requested = new URLSearchParams(window.location.search).get("fixture") ?? DEFAULT_FIXTURE;
    const selected = fixtures.find((fixture) => fixture.id === requested) ?? fixtures.find((fixture) => fixture.id === DEFAULT_FIXTURE);
    if (!selected) {
        throw new Error("No markdown fixtures found");
    }

    const select = document.querySelector<HTMLSelectElement>("#fixture");
    if (!select) {
        throw new Error("Fixture picker was not found");
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

    const fullText = await selected.load();
    const prefix = prefixMarkdownForFastOpen(fullText);
    const session: PlaygroundSession = {
        document: new MockMarkdownDocument(fullText),
        prefixPainted: prefix !== fullText,
    };
    const workspace = document.querySelector<HTMLElement>("#workspace");
    const split = document.querySelector<HTMLElement>("#workspace-split");
    if (!workspace || !split) {
        throw new Error("Playground workspace was not found");
    }
    installWorkspaceSplit(workspace, split);

    const inspectorRoot = document.querySelector<HTMLElement>("#source-inspector");
    if (!inspectorRoot) {
        throw new Error("Source inspector was not found");
    }
    const inspector = mountSourceInspector(inspectorRoot);
    let markdown = fullText;
    let selection: SourceSelection | undefined;
    let displayedEdit: MarkdownEdit | undefined;
    inspector.showDocument(markdown);

    const messageSecret = crypto.randomUUID();
    const fixturePath = `docs/tests/markdown/${selected.id}`;
    writeBootMeta(
        messageSecret,
        encodeWebviewInitialState({
            content: prefix,
            documentVersion: 1,
            readonly: readReadonly(),
            tables: { maxColumnWidth: 160, style: "wrapped" },
            skillFrontMatter: isSkillMarkdownPath(fixturePath),
            skillFolderName: skillFolderNameFromPath(fixturePath),
        }),
    );
    installVsCodeApi(
        (message) => {
            persistReadonly(message);
            openHttpLink(message);
            for (const reply of handlePlaygroundMessage(session, message)) {
                postToEditor(messageSecret, reply);
            }
            publishDocument();
        },
        (state) => {
            const next = selectionFromViewState(state);
            if (!next) {
                return;
            }
            selection = next;
            inspector.showSelection(selection);
        },
    );

    function publishDocument(): void {
        const next = session.document.text;
        if (next === markdown) {
            return;
        }
        const edit = coalesceMarkdownEdits(displayedEdit, diffMarkdown(markdown, next));
        displayedEdit = edit;
        markdown = next;
        inspector.showDocument(markdown);
        inspector.showEdit(edit);
        inspector.showSelection(selection);
    }

    await import("../webview/editor");
}

void main();
