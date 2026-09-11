/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	vscodeKeyboardProfile,
	type KeyboardBinding,
	type KeyboardProfile,
} from '@vscode/markdown-editor';

/**
 * Swap Enter and Shift+Enter from the VS Code Markdown editor defaults:
 * Enter inserts a hard line break (two trailing spaces + newline);
 * Shift+Enter keeps context-aware paragraph / list continuation.
 */
export function withHardBreakOnEnter(profile: KeyboardProfile): KeyboardProfile {
	return {
		bindings: profile.bindings.map(swapEnterBinding),
	};
}

export const markdownEditorKeyboardProfile = withHardBreakOnEnter(vscodeKeyboardProfile);

function swapEnterBinding(binding: KeyboardBinding): KeyboardBinding {
	if (binding.key !== 'Enter' || binding.action.kind !== 'enter') {
		return binding;
	}
	const shift = binding.modifiers?.shift === true;
	if (!shift && binding.action.command === 'smartEnter') {
		return { ...binding, action: { kind: 'enter', command: 'insertHardLineBreak' } };
	}
	if (shift && binding.action.command === 'insertHardLineBreak') {
		return { ...binding, action: { kind: 'enter', command: 'smartEnter' } };
	}
	return binding;
}
