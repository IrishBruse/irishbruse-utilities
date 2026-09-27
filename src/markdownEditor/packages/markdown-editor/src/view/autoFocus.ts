/**
 * The ambient focus state at the moment an editor is mounted, sampled from its
 * owning document/window. Describes what already holds focus so a newly opened
 * editor can decide whether taking focus would be an unwelcome steal.
 */
export interface AutoFocusEnvironment {
	/**
	 * Whether the editor's window currently holds the browser/OS focus
	 * (`document.hasFocus()`). `false` for an editor mounted in a background or
	 * inactive window, e.g. a webview created in a non-active tab.
	 */
	readonly windowHasFocus: boolean;

	/**
	 * Whether focus is still unclaimed — the document has no active element, or
	 * it is the `<body>` fallback. `true` means no explicit user target owns
	 * focus yet; `false` means the user (or another widget) already focused
	 * something that must not be interrupted.
	 */
	readonly focusIsUnclaimed: boolean;
}

/**
 * Whether a freshly opened editor may take focus without stealing it from an
 * explicit user target. Taking focus is only safe when the window already has
 * focus and nothing else has claimed it.
 */
export function shouldAutoFocusOnOpen(environment: AutoFocusEnvironment): boolean {
	return environment.windowHasFocus && environment.focusIsUnclaimed;
}

/**
 * Whether an editor that could not take focus on open should defer a single
 * further attempt until the window next gains focus. Deferring is warranted
 * only when the window is not focused yet — the common open-time race where the
 * editor is mounted before the host routes focus to its window. When the window
 * is already focused, focus is genuinely claimed elsewhere, so there is nothing
 * to wait for and no retry should be armed.
 */
export function shouldDeferAutoFocus(environment: Pick<AutoFocusEnvironment, 'windowHasFocus'>): boolean {
	return !environment.windowHasFocus;
}
