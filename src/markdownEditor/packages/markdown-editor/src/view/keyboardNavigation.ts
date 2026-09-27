import {
	commands,
	type CursorKeyboardAction,
	type EditKeyboardAction,
	type EditorKeyboardAction,
	type KeyboardModifiers,
	type KeyboardPlatform,
} from '../editorCommands.js';

export type {
	CursorKeyboardAction,
	EditKeyboardAction,
	EditorKeyboardAction,
	KeyboardModifiers,
	KeyboardPlatform,
} from '../editorCommands.js';

export interface EditorKeyboardEvent {
	readonly key: string;
	readonly code: string;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly ctrlKey: boolean;
	readonly metaKey: boolean;
	readonly altGraphKey: boolean;
}

export interface KeyboardBinding {
	readonly key: string;
	readonly modifiers?: KeyboardModifiers;
	readonly platforms?: readonly KeyboardPlatform[];
	readonly action: EditorKeyboardAction;
}

export interface KeyboardProfile {
	/**
	 * Bindings in priority order. The first exact key/modifier/platform match wins.
	 */
	readonly bindings: readonly KeyboardBinding[];
}

export const vscodeKeyboardProfile: KeyboardProfile = {
	bindings: commands.flatMap(command => command.keybindings.map(binding => ({
		...binding,
		action: command.action,
	}))),
};

export const vscodeLocalKeyboardProfile: KeyboardProfile = {
	bindings: commands
		.filter(command => command.routing === 'local')
		.flatMap(command => command.keybindings.map(binding => ({
			...binding,
			action: command.action,
		}))),
};

export const vscodeHostKeyboardProfile: KeyboardProfile = {
	bindings: commands
		.filter(command => command.routing !== 'local')
		.flatMap(command => command.keybindings.map(binding => ({
			...binding,
			action: command.action,
		}))),
};

/**
 * Keys whose browser default action moves the caret or extends the native DOM
 * selection.
 *
 * The editor owns caret motion and paints selection from its own model, so the
 * browser must never move a caret on its behalf — not even for a chord the
 * active profile deliberately leaves unbound (macOS Shift+Option+Down, which
 * VS Code maps to Copy Line Down). Letting the default action run creates a DOM
 * selection anchored wherever the browser last had one — normally the start of
 * the document, since the editor never sets one — which paints a second,
 * wrong-looking highlight that nothing subsequently clears.
 *
 * Page Up/Down are excluded on purpose: the editor has no page-motion command,
 * so their default scroll is the only way to page through a long document.
 */
const CARET_MOTION_KEYS: ReadonlySet<string> = new Set([
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
	'Home',
	'End',
]);

export function isCaretMotionKey(key: string): boolean {
	return CARET_MOTION_KEYS.has(key);
}

export function detectKeyboardPlatform(userAgent: string): KeyboardPlatform {
	if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS X')) {
		return 'macos';
	}
	if (userAgent.includes('Windows')) {
		return 'windows';
	}
	return 'linux';
}

export function toEditorKeyboardEvent(event: KeyboardEvent): EditorKeyboardEvent {
	return {
		key: event.key,
		code: event.code,
		shiftKey: event.shiftKey,
		altKey: event.altKey,
		ctrlKey: event.ctrlKey,
		metaKey: event.metaKey,
		altGraphKey: event.getModifierState('AltGraph'),
	};
}

export function resolveEditorKeyboardAction(
	event: EditorKeyboardEvent,
	platform: KeyboardPlatform,
	profile: KeyboardProfile = vscodeKeyboardProfile,
): EditorKeyboardAction | undefined {
	if (event.altGraphKey) { return undefined; }
	const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
	const physicalKey = /^[a-z]$/.test(key) ? undefined : physicalLetterFromCode(event.code);
	for (const candidate of profile.bindings) {
		if (
			(candidate.key === key || candidate.key === physicalKey)
			&& (!candidate.platforms || candidate.platforms.includes(platform))
			&& matches(event, candidate.modifiers)
		) {
			return candidate.action;
		}
	}
	return undefined;
}

function physicalLetterFromCode(code: string): string | undefined {
	const match = /^Key([A-Z])$/.exec(code);
	return match?.[1].toLowerCase();
}

function matches(event: EditorKeyboardEvent, modifiers: KeyboardModifiers = {}): boolean {
	return event.shiftKey === !!modifiers.shift
		&& event.altKey === !!modifiers.alt
		&& event.ctrlKey === !!modifiers.ctrl
		&& event.metaKey === !!modifiers.meta;
}
