import {
    applyDiagramTokens,
    getThemeCSS,
    getThemeVariables,
    getTokens,
    type MermaidTokens,
} from "./vsCodeTheme";

function isDarkVsCodeTheme(): boolean {
    return (
        document.body.classList.contains("vscode-dark") ||
        (document.body.classList.contains("vscode-high-contrast") &&
            !document.body.classList.contains("vscode-high-contrast-light"))
    );
}

function readCssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function rgbStringToHex(value: string): string | undefined {
    const match = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
    if (!match) {
        return undefined;
    }

    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    const a = match[4] !== undefined ? Math.round(parseFloat(match[4]) * 255) : 255;
    const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");

    return a < 255 ? `#${hex(r)}${hex(g)}${hex(b)}${hex(a)}` : `#${hex(r)}${hex(g)}${hex(b)}`;
}

function resolveCssColor(cssValue: string): string | undefined {
    const probe = document.createElement("span");
    probe.style.display = "none";
    probe.style.color = cssValue;
    document.body.appendChild(probe);
    try {
        return rgbStringToHex(getComputedStyle(probe).color);
    } finally {
        probe.remove();
    }
}

function pickColor(...varNames: string[]): string | undefined {
    for (const name of varNames) {
        if (!readCssVar(name)) {
            continue;
        }

        const hex = resolveCssColor(`var(${name})`);
        if (hex) {
            return hex;
        }
    }
    return undefined;
}

function buildTheme() {
    const tokens = getTokens(pickColor, readCssVar, isDarkVsCodeTheme);
    return {
        tokens,
        themeVariables: getThemeVariables(tokens, pickColor),
        themeCSS: getThemeCSS(tokens),
    };
}

declare global {
    interface Window {
        IbMermaidVsCodeTheme: {
            getTokens: () => MermaidTokens;
            getThemeVariables: (tokens?: MermaidTokens) => Record<string, string | boolean>;
            getThemeCSS: (tokens?: MermaidTokens) => string;
            applyDiagramTokens: (element: HTMLElement) => void;
        };
    }
}

export function getWorkbenchMermaidTokens(): MermaidTokens {
    return getTokens(pickColor, readCssVar, isDarkVsCodeTheme);
}

export function getWorkbenchMermaidInit(): {
    readonly tokens: MermaidTokens;
    readonly themeVariables: Record<string, string | boolean>;
    readonly themeCSS: string;
} {
    const tokens = getWorkbenchMermaidTokens();
    return {
        tokens,
        themeVariables: getThemeVariables(tokens, pickColor),
        themeCSS: getThemeCSS(tokens),
    };
}

export function applyWorkbenchMermaidTokens(element: HTMLElement): MermaidTokens {
    const tokens = getWorkbenchMermaidTokens();
    applyDiagramTokens(element, tokens);
    return tokens;
}

window.IbMermaidVsCodeTheme = {
    getTokens() {
        return getWorkbenchMermaidTokens();
    },
    getThemeVariables(tokens?: MermaidTokens) {
        const resolved = tokens ?? getWorkbenchMermaidTokens();
        return getThemeVariables(resolved, pickColor);
    },
    getThemeCSS(tokens?: MermaidTokens) {
        const resolved = tokens ?? getWorkbenchMermaidTokens();
        return getThemeCSS(resolved);
    },
    applyDiagramTokens(element: HTMLElement) {
        applyWorkbenchMermaidTokens(element);
    },
};
