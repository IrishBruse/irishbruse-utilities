import { describe, expect, it } from 'vitest';
import { vscodeKeyboardProfile } from '@vscode/markdown-editor';
import { markdownEditorKeyboardProfile, withHardBreakOnEnter } from './keyboardProfile';

function enterCommands(profile: ReturnType<typeof withHardBreakOnEnter>) {
	return profile.bindings
		.filter(binding => binding.key === 'Enter' && binding.action.kind === 'enter')
		.map(binding => ({
			shift: binding.modifiers?.shift === true,
			ctrl: binding.modifiers?.ctrl === true,
			meta: binding.modifiers?.meta === true,
			command: binding.action.kind === 'enter' ? binding.action.command : undefined,
		}));
}

describe('withHardBreakOnEnter', () => {
	it('maps Enter to a hard line break and Shift+Enter to smart enter', () => {
		const commands = enterCommands(markdownEditorKeyboardProfile);
		expect(commands).toContainEqual({
			shift: false,
			ctrl: false,
			meta: false,
			command: 'insertHardLineBreak',
		});
		expect(commands).toContainEqual({
			shift: true,
			ctrl: false,
			meta: false,
			command: 'smartEnter',
		});
	});

	it('does not change Ctrl/Cmd+Enter paragraph insertion', () => {
		const before = enterCommands(vscodeKeyboardProfile).filter(binding => binding.ctrl || binding.meta);
		const after = enterCommands(markdownEditorKeyboardProfile).filter(binding => binding.ctrl || binding.meta);
		expect(after).toEqual(before);
	});
});
