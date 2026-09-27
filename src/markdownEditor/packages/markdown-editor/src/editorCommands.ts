export type KeyboardPlatform = 'macos' | 'windows' | 'linux';

export type CursorKeyboardAction =
	| 'left'
	| 'right'
	| 'up'
	| 'down'
	| 'wordLeft'
	| 'wordRight'
	| 'visualLineStart'
	| 'visualLineEnd'
	| 'logicalLineStart'
	| 'logicalLineEnd'
	| 'documentStart'
	| 'documentEnd';

export type EditKeyboardAction =
	| 'deleteLeft'
	| 'deleteRight'
	| 'deleteWordLeft'
	| 'deleteWordRight'
	| 'deleteLineLeft'
	| 'deleteLineRight'
	| 'copyLinesUp'
	| 'copyLinesDown'
	| 'moveLinesUp'
	| 'moveLinesDown'
	| 'deleteLines'
	| 'joinLines';

export type HistoryKeyboardAction = 'undo' | 'redo';
export type TabKeyboardAction = 'insert' | 'outdent';

export type EditorKeyboardAction =
	| { readonly kind: 'cursor'; readonly command: CursorKeyboardAction; readonly extend: boolean }
	| { readonly kind: 'edit'; readonly command: EditKeyboardAction }
	| { readonly kind: 'history'; readonly command: HistoryKeyboardAction }
	| { readonly kind: 'tab'; readonly command: TabKeyboardAction }
	| { readonly kind: 'toggleTabFocus' }
	| { readonly kind: 'toggleReadonly' }
	| { readonly kind: 'selectAll' }
	| { readonly kind: 'enter'; readonly command: 'smartEnter' | 'insertParagraph' | 'insertHardLineBreak' };

export interface KeyboardModifiers {
	readonly shift?: boolean;
	readonly alt?: boolean;
	readonly ctrl?: boolean;
	readonly meta?: boolean;
}

export interface EditorCommandKeybinding {
	readonly key: string;
	readonly modifiers?: KeyboardModifiers;
	readonly platforms?: readonly KeyboardPlatform[];
}

export interface EditorCommandDefinition {
	readonly id: `markdown.editor.${string}`;
	readonly title: string;
	readonly action: EditorKeyboardAction;
	readonly keybindings: readonly EditorCommandKeybinding[];
	/**
	 * Local commands must execute synchronously in the webview instead of being
	 * forwarded through the VS Code keybinding service.
	 */
	readonly routing?: 'host' | 'local';
}

const MACOS = ['macos'] as const;
const NON_MACOS = ['windows', 'linux'] as const;

const cursor = (command: CursorKeyboardAction, extend = false): EditorKeyboardAction => ({
	kind: 'cursor',
	command,
	extend,
});
const edit = (command: EditKeyboardAction): EditorKeyboardAction => ({ kind: 'edit', command });
const history = (command: HistoryKeyboardAction): EditorKeyboardAction => ({ kind: 'history', command });
const tab = (command: TabKeyboardAction): EditorKeyboardAction => ({ kind: 'tab', command });
const enter = (command: 'smartEnter' | 'insertParagraph' | 'insertHardLineBreak'): EditorKeyboardAction => ({
	kind: 'enter',
	command,
});
const binding = (
	key: string,
	modifiers?: KeyboardModifiers,
	platforms?: readonly KeyboardPlatform[],
): EditorCommandKeybinding => ({ key, modifiers, platforms });
const command = (
	id: EditorCommandDefinition['id'],
	title: string,
	action: EditorKeyboardAction,
	keybindings: readonly EditorCommandKeybinding[],
	routing: EditorCommandDefinition['routing'] = 'host',
): EditorCommandDefinition => ({ id, title, action, keybindings, routing });

/**
 * Canonical editor command catalog. Standalone keyboard handling and host
 * integrations derive their command registration and default keybindings from
 * this list.
 */
export const commands: readonly EditorCommandDefinition[] = [
	command('markdown.editor.cursorLeft', 'Move Cursor Left', cursor('left'), [
		binding('b', { ctrl: true }, MACOS),
		binding('ArrowLeft'),
	]),
	command('markdown.editor.cursorRight', 'Move Cursor Right', cursor('right'), [
		binding('f', { ctrl: true }, MACOS),
		binding('ArrowRight'),
	]),
	command('markdown.editor.cursorUp', 'Move Cursor Up', cursor('up'), [
		binding('p', { ctrl: true }, MACOS),
		binding('ArrowUp'),
	]),
	command('markdown.editor.cursorDown', 'Move Cursor Down', cursor('down'), [
		binding('n', { ctrl: true }, MACOS),
		binding('ArrowDown'),
	]),
	command('markdown.editor.cursorLeftSelect', 'Select Left', cursor('left', true), [
		binding('ArrowLeft', { shift: true }),
	]),
	command('markdown.editor.cursorRightSelect', 'Select Right', cursor('right', true), [
		binding('ArrowRight', { shift: true }),
	]),
	command('markdown.editor.cursorUpSelect', 'Select Up', cursor('up', true), [
		binding('ArrowUp', { shift: true }),
	]),
	command('markdown.editor.cursorDownSelect', 'Select Down', cursor('down', true), [
		binding('ArrowDown', { shift: true }),
	]),
	command('markdown.editor.cursorWordLeft', 'Move Cursor Word Left', cursor('wordLeft'), [
		binding('ArrowLeft', { alt: true }, MACOS),
		binding('ArrowLeft', { ctrl: true }, NON_MACOS),
	]),
	command('markdown.editor.cursorWordRight', 'Move Cursor Word Right', cursor('wordRight'), [
		binding('ArrowRight', { alt: true }, MACOS),
		binding('ArrowRight', { ctrl: true }, NON_MACOS),
	]),
	command('markdown.editor.cursorWordLeftSelect', 'Select Word Left', cursor('wordLeft', true), [
		binding('ArrowLeft', { alt: true, shift: true }, MACOS),
		binding('ArrowLeft', { ctrl: true, shift: true }, NON_MACOS),
	]),
	command('markdown.editor.cursorWordRightSelect', 'Select Word Right', cursor('wordRight', true), [
		binding('ArrowRight', { alt: true, shift: true }, MACOS),
		binding('ArrowRight', { ctrl: true, shift: true }, NON_MACOS),
	]),
	command('markdown.editor.cursorVisualLineStart', 'Move Cursor to Visual Line Start', cursor('visualLineStart'), [
		binding('ArrowLeft', { meta: true }, MACOS),
		binding('Home'),
	]),
	command('markdown.editor.cursorVisualLineEnd', 'Move Cursor to Visual Line End', cursor('visualLineEnd'), [
		binding('ArrowRight', { meta: true }, MACOS),
		binding('End'),
	]),
	command('markdown.editor.cursorVisualLineStartSelect', 'Select to Visual Line Start', cursor('visualLineStart', true), [
		binding('ArrowLeft', { meta: true, shift: true }, MACOS),
		binding('Home', { shift: true }),
	]),
	command('markdown.editor.cursorVisualLineEndSelect', 'Select to Visual Line End', cursor('visualLineEnd', true), [
		binding('ArrowRight', { meta: true, shift: true }, MACOS),
		binding('End', { shift: true }),
	]),
	command('markdown.editor.cursorLogicalLineStart', 'Move Cursor to Logical Line Start', cursor('logicalLineStart'), [
		binding('a', { ctrl: true }, MACOS),
	]),
	command('markdown.editor.cursorLogicalLineEnd', 'Move Cursor to Logical Line End', cursor('logicalLineEnd'), [
		binding('e', { ctrl: true }, MACOS),
	]),
	command('markdown.editor.cursorLogicalLineStartSelect', 'Select to Logical Line Start', cursor('logicalLineStart', true), [
		binding('a', { ctrl: true, shift: true }, MACOS),
	]),
	command('markdown.editor.cursorLogicalLineEndSelect', 'Select to Logical Line End', cursor('logicalLineEnd', true), [
		binding('e', { ctrl: true, shift: true }, MACOS),
	]),
	command('markdown.editor.cursorDocumentStart', 'Move Cursor to Document Start', cursor('documentStart'), [
		binding('ArrowUp', { meta: true }, MACOS),
		binding('Home', { ctrl: true }, NON_MACOS),
	]),
	command('markdown.editor.cursorDocumentEnd', 'Move Cursor to Document End', cursor('documentEnd'), [
		binding('ArrowDown', { meta: true }, MACOS),
		binding('End', { ctrl: true }, NON_MACOS),
	]),
	command('markdown.editor.cursorDocumentStartSelect', 'Select to Document Start', cursor('documentStart', true), [
		binding('ArrowUp', { meta: true, shift: true }, MACOS),
		binding('Home', { ctrl: true, shift: true }, NON_MACOS),
	]),
	command('markdown.editor.cursorDocumentEndSelect', 'Select to Document End', cursor('documentEnd', true), [
		binding('ArrowDown', { meta: true, shift: true }, MACOS),
		binding('End', { ctrl: true, shift: true }, NON_MACOS),
	]),
	command('markdown.editor.selectAll', 'Select All', { kind: 'selectAll' }, [
		binding('a', { meta: true }, MACOS),
		binding('a', { ctrl: true }, NON_MACOS),
	]),
	command('markdown.editor.deleteLeft', 'Delete Left', edit('deleteLeft'), [
		binding('h', { ctrl: true }, MACOS),
		binding('Backspace', { ctrl: true }, MACOS),
		binding('Backspace'),
		binding('Backspace', { shift: true }),
	]),
	command('markdown.editor.deleteRight', 'Delete Right', edit('deleteRight'), [
		binding('d', { ctrl: true }, MACOS),
		binding('Delete', { ctrl: true }, MACOS),
		binding('Delete'),
	]),
	command('markdown.editor.deleteWordLeft', 'Delete Word Left', edit('deleteWordLeft'), [
		binding('Backspace', { alt: true }, MACOS),
		binding('Backspace', { ctrl: true }, NON_MACOS),
	]),
	command('markdown.editor.deleteWordRight', 'Delete Word Right', edit('deleteWordRight'), [
		binding('Delete', { alt: true }, MACOS),
		binding('Delete', { ctrl: true }, NON_MACOS),
	]),
	command('markdown.editor.deleteLineLeft', 'Delete All Left', edit('deleteLineLeft'), [
		binding('Backspace', { meta: true }, MACOS),
	]),
	command('markdown.editor.deleteLineRight', 'Delete All Right', edit('deleteLineRight'), [
		binding('Delete', { meta: true }, MACOS),
		binding('k', { ctrl: true }, MACOS),
	]),
	command('markdown.editor.copyLinesUp', 'Copy Line Up', edit('copyLinesUp'), [
		binding('ArrowUp', { alt: true, shift: true }, MACOS),
		binding('ArrowUp', { alt: true, shift: true }, ['windows']),
		binding('ArrowUp', { ctrl: true, alt: true, shift: true }, ['linux']),
	]),
	command('markdown.editor.copyLinesDown', 'Copy Line Down', edit('copyLinesDown'), [
		binding('ArrowDown', { alt: true, shift: true }, MACOS),
		binding('ArrowDown', { alt: true, shift: true }, ['windows']),
		binding('ArrowDown', { ctrl: true, alt: true, shift: true }, ['linux']),
	]),
	command('markdown.editor.moveLinesUp', 'Move Line Up', edit('moveLinesUp'), [
		binding('ArrowUp', { alt: true }),
	]),
	command('markdown.editor.moveLinesDown', 'Move Line Down', edit('moveLinesDown'), [
		binding('ArrowDown', { alt: true }),
	]),
	command('markdown.editor.deleteLines', 'Delete Line', edit('deleteLines'), [
		binding('k', { meta: true, shift: true }, MACOS),
		binding('k', { ctrl: true, shift: true }, NON_MACOS),
	]),
	command('markdown.editor.joinLines', 'Join Lines', edit('joinLines'), [
		binding('j', { ctrl: true }, MACOS),
	]),
	command('markdown.editor.toggleLocked', 'Toggle Editing/Locked Mode', { kind: 'toggleReadonly' }, [
		binding('e', { meta: true }, MACOS),
	]),
	command('markdown.editor.undo', 'Undo', history('undo'), [
		binding('z', { meta: true }, MACOS),
		binding('z', { ctrl: true }, NON_MACOS),
	]),
	command('markdown.editor.redo', 'Redo', history('redo'), [
		binding('z', { meta: true, shift: true }, MACOS),
		binding('z', { ctrl: true, shift: true }, NON_MACOS),
		binding('y', { ctrl: true }, NON_MACOS),
	]),
	command('markdown.editor.insertTab', 'Insert Tab', tab('insert'), [
		binding('Tab'),
	], 'local'),
	command('markdown.editor.outdent', 'Outdent', tab('outdent'), [
		binding('Tab', { shift: true }),
	], 'local'),
	command('markdown.editor.toggleTabFocus', 'Toggle Tab Key Moves Focus', { kind: 'toggleTabFocus' }, [
		binding('m', { ctrl: true }),
	], 'local'),
	command('markdown.editor.smartEnter', 'Insert Paragraph', enter('smartEnter'), [
		binding('Enter'),
	]),
	command('markdown.editor.insertHardLineBreak', 'Insert Hard Line Break', enter('insertHardLineBreak'), [
		binding('Enter', { shift: true }),
	]),
	command('markdown.editor.insertParagraph', 'Insert Paragraph Without Continuing Markup', enter('insertParagraph'), [
		binding('Enter', { meta: true }, MACOS),
		binding('Enter', { ctrl: true }),
	]),
];
