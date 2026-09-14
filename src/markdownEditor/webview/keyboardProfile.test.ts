import { describe, expect, it } from 'vitest';
import { markdownEditorKeyboardProfile } from './keyboardProfile';

function enterCommands(profile: typeof markdownEditorKeyboardProfile) {
	return profile.bindings
		.filter(binding => binding.key === 'Enter' && binding.action.kind === 'enter')
		.map(binding => ({
			shift: binding.modifiers?.shift === true,
			ctrl: binding.modifiers?.ctrl === true,
			meta: binding.modifiers?.meta === true,
			command: binding.action.kind === 'enter' ? binding.action.command : undefined,
		}));
}

describe('markdownEditorKeyboardProfile', () => {
	it('keeps Enter as smart enter and Shift+Enter as a hard line break', () => {
		const commands = enterCommands(markdownEditorKeyboardProfile);
		expect(commands).toContainEqual({
			shift: false,
			ctrl: false,
			meta: false,
			command: 'smartEnter',
		});
		expect(commands).toContainEqual({
			shift: true,
			ctrl: false,
			meta: false,
			command: 'insertHardLineBreak',
		});
	});
});
