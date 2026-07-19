let refresh: (() => void) | undefined;

export function registerGitHelpersRefresh(fn: () => void): void {
    refresh = fn;
}

export function refreshGitHelpersView(): void {
    refresh?.();
}
