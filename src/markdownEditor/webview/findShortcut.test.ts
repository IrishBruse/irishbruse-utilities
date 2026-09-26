import { describe, expect, it } from 'vitest';
import { findKeyboardPlatform, isEditorFindShortcut, type FindShortcutEvent } from './findShortcut';

function key(partial: Partial<FindShortcutEvent> & Pick<FindShortcutEvent, 'key'>): FindShortcutEvent {
	return {
		shiftKey: false,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		...partial,
	};
}

describe('isEditorFindShortcut', () => {
	it('matches Ctrl+F on Windows and Linux', () => {
		expect(isEditorFindShortcut(key({ key: 'f', ctrlKey: true }), 'linux')).toBe(true);
		expect(isEditorFindShortcut(key({ key: 'F', ctrlKey: true }), 'windows')).toBe(true);
	});

	it('matches Cmd+F on macOS', () => {
		expect(isEditorFindShortcut(key({ key: 'f', metaKey: true }), 'macos')).toBe(true);
		expect(isEditorFindShortcut(key({ key: 'f', ctrlKey: true }), 'macos')).toBe(false);
	});

	it('ignores shifted, alt, and plain F', () => {
		expect(isEditorFindShortcut(key({ key: 'f', ctrlKey: true, shiftKey: true }), 'linux')).toBe(false);
		expect(isEditorFindShortcut(key({ key: 'f', ctrlKey: true, altKey: true }), 'linux')).toBe(false);
		expect(isEditorFindShortcut(key({ key: 'f' }), 'linux')).toBe(false);
		expect(isEditorFindShortcut(key({ key: 'f', ctrlKey: true, isComposing: true }), 'linux')).toBe(false);
	});
});

describe('findKeyboardPlatform', () => {
	it('reads the platform from the user agent', () => {
		expect(findKeyboardPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos');
		expect(findKeyboardPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
		expect(findKeyboardPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
	});
});
