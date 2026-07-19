let refresh: (() => void) | undefined;

export function registerActionPanelRefresh(fn: () => void): void {
    refresh = fn;
}

export function refreshActionPanel(): void {
    refresh?.();
}
