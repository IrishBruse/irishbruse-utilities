export type FindKeyboardPlatform = 'macos' | 'windows' | 'linux';

export interface FindShortcutEvent {
	readonly key: string;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly ctrlKey: boolean;
	readonly metaKey: boolean;
	readonly isComposing?: boolean;
}

export function findKeyboardPlatform(userAgent: string): FindKeyboardPlatform {
	if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS X')) {
		return 'macos';
	}
	if (userAgent.includes('Windows')) {
		return 'windows';
	}
	return 'linux';
}

/** Ctrl+F / Cmd+F, matching the markdown editor find controller. */
export function isEditorFindShortcut(event: FindShortcutEvent, platform: FindKeyboardPlatform): boolean {
	if (event.isComposing || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'f') {
		return false;
	}
	return platform === 'macos'
		? event.metaKey && !event.ctrlKey
		: event.ctrlKey && !event.metaKey;
}
