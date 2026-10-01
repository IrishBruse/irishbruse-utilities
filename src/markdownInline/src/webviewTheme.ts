export function parseStyleAttributeVariables(style: string): ReadonlyMap<string, string> {
    const vars = new Map<string, string>();
    for (const chunk of style.split(";")) {
        const colon = chunk.indexOf(":");
        if (colon <= 0) {
            continue;
        }
        const name = chunk.slice(0, colon).trim();
        const value = chunk.slice(colon + 1).trim();
        if (name.startsWith("--vscode-") && value.length > 0) {
            vars.set(name, value);
        }
    }
    return vars;
}

export function webviewThemeTargets(parent: HTMLElement): HTMLElement[] {
    const targets: HTMLElement[] = [];
    const add = (node: Element | null): void => {
        if (node instanceof HTMLElement && !targets.includes(node)) {
            targets.push(node);
        }
    };
    add(parent.classList.contains("inline-md-root") ? parent : parent.querySelector(".inline-md-root"));
    const root = targets[0];
    if (root) {
        for (const node of root.querySelectorAll(".monaco-editor")) {
            add(node);
        }
    }
    return targets;
}

export function applyWebviewThemeVariables(targets: readonly HTMLElement[]): void {
    const vars = new Map<string, string>();
    for (const [name, value] of parseStyleAttributeVariables(document.documentElement.getAttribute("style") ?? "")) {
        vars.set(name, value);
    }
    for (const [name, value] of parseStyleAttributeVariables(document.body.getAttribute("style") ?? "")) {
        vars.set(name, value);
    }
    if (vars.size === 0) {
        return;
    }
    for (const target of targets) {
        for (const [name, value] of vars) {
            target.style.setProperty(name, value);
        }
    }
}

export function installWebviewThemeSync(getTargets: () => readonly HTMLElement[]): () => void {
    const apply = (): void => {
        const targets = getTargets().filter((target) => target.isConnected);
        if (targets.length === 0) {
            return;
        }
        applyWebviewThemeVariables(targets);
    };
    apply();
    const observer = new MutationObserver(() => {
        apply();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
    return () => {
        observer.disconnect();
    };
}
