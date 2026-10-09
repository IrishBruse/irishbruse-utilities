import { afterEach, describe, expect, it, vi } from "vitest";
import {
    applyWebviewThemeVariables,
    installWebviewThemeSync,
    parseStyleAttributeVariables,
    webviewThemeTargets,
} from "./webviewTheme";

describe("parseStyleAttributeVariables", () => {
    it("reads vscode custom properties from an inline style attribute", () => {
        const vars = parseStyleAttributeVariables(
            "--vscode-editor-background: #282c34; --vscode-input-background: #252931;",
        );
        expect(vars.get("--vscode-editor-background")).toBe("#282c34");
        expect(vars.get("--vscode-input-background")).toBe("#252931");
    });

    it("skips empty chunks, foreign properties, and blank values", () => {
        const vars = parseStyleAttributeVariables(
            "; :missing; color: red; --vscode-empty: ; --vscode-font-family: Consolas, monospace; --not-vscode: 1",
        );
        expect(vars.size).toBe(1);
        expect(vars.get("--vscode-font-family")).toBe("Consolas, monospace");
    });
});

class ThemeElement {
    isConnected = true;
    children: ThemeElement[] = [];
    querySelectorOverride: ThemeElement | object | null | undefined;
    querySelectorAllOverride: Array<ThemeElement | object> | undefined;
    readonly styleProps = new Map<string, string>();
    readonly style = {
        setProperty: (name: string, value: string) => {
            this.styleProps.set(name, value);
        },
    };
    private readonly classes = new Set<string>();

    constructor(classes: string[] = []) {
        for (const name of classes) {
            this.classes.add(name);
        }
    }

    classList = {
        contains: (name: string) => this.classes.has(name),
    };

    querySelector(selector: string): ThemeElement | object | null {
        if (this.querySelectorOverride !== undefined) {
            return this.querySelectorOverride;
        }
        if (selector !== ".inline-md-root") {
            return null;
        }
        return this.descendants().find((node) => node.classList.contains("inline-md-root")) ?? null;
    }

    querySelectorAll(selector: string): Array<ThemeElement | object> {
        if (this.querySelectorAllOverride !== undefined) {
            return this.querySelectorAllOverride;
        }
        if (selector !== ".monaco-editor") {
            return [];
        }
        return this.descendants().filter((node) => node.classList.contains("monaco-editor"));
    }

    private descendants(): ThemeElement[] {
        return this.children.flatMap((child) => [child, ...child.descendants()]);
    }
}

function themeNode(classes: string[] = []): HTMLElement {
    return new ThemeElement(classes) as unknown as HTMLElement;
}

describe("webview theme targets", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("collects the inline root and each monaco editor once", () => {
        vi.stubGlobal("HTMLElement", ThemeElement);
        const editor = new ThemeElement(["monaco-editor"]);
        const nested = new ThemeElement(["monaco-editor"]);
        const root = new ThemeElement(["inline-md-root"]);
        root.children = [editor, nested];

        expect(webviewThemeTargets(root as unknown as HTMLElement)).toEqual([root, editor, nested]);

        const wrapper = new ThemeElement();
        wrapper.children = [root];
        expect(webviewThemeTargets(wrapper as unknown as HTMLElement)).toEqual([root, editor, nested]);

        expect(webviewThemeTargets(themeNode())).toEqual([]);

        const foreign = new ThemeElement();
        foreign.querySelectorOverride = {};
        expect(webviewThemeTargets(foreign as unknown as HTMLElement)).toEqual([]);

        const duplicated = new ThemeElement(["inline-md-root"]);
        duplicated.querySelectorAllOverride = [editor, editor, {}];
        expect(webviewThemeTargets(duplicated as unknown as HTMLElement)).toEqual([duplicated, editor]);
    });
});

describe("applyWebviewThemeVariables", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("copies document and body variables onto each target", () => {
        vi.stubGlobal("HTMLElement", ThemeElement);
        let htmlStyle: string | null = null;
        let bodyStyle: string | null = null;
        vi.stubGlobal("document", {
            documentElement: { getAttribute: () => htmlStyle },
            body: { getAttribute: () => bodyStyle },
        });

        const first = new ThemeElement();
        const second = new ThemeElement();
        applyWebviewThemeVariables([first, second] as unknown as HTMLElement[]);
        expect(first.styleProps.size).toBe(0);

        htmlStyle = "--vscode-editor-background: #111; color: red";
        bodyStyle = null;
        applyWebviewThemeVariables([first] as unknown as HTMLElement[]);
        expect(first.styleProps.get("--vscode-editor-background")).toBe("#111");

        bodyStyle = "--vscode-editor-background: #222; --vscode-editor-foreground: #eee";
        applyWebviewThemeVariables([first, second] as unknown as HTMLElement[]);
        expect(first.styleProps.get("--vscode-editor-background")).toBe("#222");
        expect(first.styleProps.get("--vscode-editor-foreground")).toBe("#eee");
        expect(second.styleProps.get("--vscode-editor-foreground")).toBe("#eee");

        htmlStyle = "";
        bodyStyle = "";
        second.styleProps.clear();
        applyWebviewThemeVariables([second] as unknown as HTMLElement[]);
        expect(second.styleProps.size).toBe(0);
    });
});

describe("installWebviewThemeSync", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("applies the theme to connected targets and disconnects the observers", () => {
        vi.stubGlobal("HTMLElement", ThemeElement);
        const observers: Array<{ callback: () => void; disconnected: boolean; observes: number }> = [];
        class RecordingObserver {
            disconnected = false;
            observes = 0;
            constructor(readonly callback: () => void) {
                observers.push(this);
            }
            observe() {
                this.observes += 1;
            }
            disconnect() {
                this.disconnected = true;
            }
        }
        vi.stubGlobal("MutationObserver", RecordingObserver);

        let htmlStyle: string | null = null;
        const bodyStyle: string | null = "";
        vi.stubGlobal("document", {
            documentElement: { getAttribute: () => htmlStyle },
            body: { getAttribute: () => bodyStyle },
        });

        const connected = new ThemeElement();
        const loose = new ThemeElement();
        loose.isConnected = false;
        let targets: ThemeElement[] = [loose];
        const stop = installWebviewThemeSync(() => targets as unknown as HTMLElement[]);
        expect(observers).toHaveLength(1);
        expect(observers[0].observes).toBe(2);
        expect(connected.styleProps.size).toBe(0);

        htmlStyle = "--vscode-editor-background: #010101";
        targets = [connected, loose];
        observers[0].callback();
        expect(connected.styleProps.get("--vscode-editor-background")).toBe("#010101");
        expect(loose.styleProps.size).toBe(0);

        targets = [];
        observers[0].callback();
        expect(connected.styleProps.get("--vscode-editor-background")).toBe("#010101");

        stop();
        expect(observers[0].disconnected).toBe(true);
    });
});
