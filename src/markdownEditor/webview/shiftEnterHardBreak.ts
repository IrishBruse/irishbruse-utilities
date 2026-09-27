import {
	type AstNode,
	type BlockAstNode,
	type DocumentAstNode,
	EditorModel,
	OffsetRange,
	Selection,
	StringEdit,
} from '@vscode/markdown-editor';

/**
 * Shift+Enter at the end of a paragraph inserts two spaces and a newline.
 * At the end of a block those spaces are trailing glue, not a hard break, so
 * the caret stays on the same line after the `·` dots. This plans a real next
 * line: keep exactly two trailing spaces, and park the caret on a pending line
 * that materializes as `  \n` plus whatever the user types.
 */
export interface ShiftEnterAtBlockEnd {
	readonly edit: StringEdit | undefined;
	/** Offset inside the block text after `edit`, used to find the block again. */
	readonly anchorOffset: number;
	readonly pendingStart: number;
	readonly pendingEnd: number;
	readonly atEof: boolean;
}

const HARD_BREAK_SPACES = '  ';

export function planShiftEnterAtBlockEnd(
	text: string,
	offset: number,
	doc: DocumentAstNode,
): ShiftEnterAtBlockEnd | undefined {
	const located = findDeepestBlock(doc, offset);
	if (!located) {
		return undefined;
	}
	const { block, start: blockStart } = located;
	if (block.kind !== 'paragraph' && block.kind !== 'heading') {
		return undefined;
	}
	const blockEnd = blockStart + block.length;
	const glueLength = trailingGlueLength(block);
	const textEnd = blockEnd - glueLength;
	const glue = text.slice(textEnd, blockEnd);
	if (glue.length > 0 && !/^[\n ]*$/.test(glue)) {
		return undefined;
	}
	if (offset < textEnd && /[^ ]/.test(text.slice(offset, textEnd))) {
		return undefined;
	}
	if (offset > blockEnd) {
		return undefined;
	}

	let spaceStart = textEnd;
	while (spaceStart > blockStart && text[spaceStart - 1] === ' ') {
		spaceStart--;
	}
	const hasFollowing = blockEnd < text.length;
	const suffix = hasFollowing ? `${HARD_BREAK_SPACES}\n\n` : `${HARD_BREAK_SPACES}\n`;
	const current = text.slice(spaceStart, blockEnd);
	const edit = current === suffix ? undefined : StringEdit.replace(new OffsetRange(spaceStart, blockEnd), suffix);
	const pendingStart = spaceStart + HARD_BREAK_SPACES.length + 1;
	return {
		edit,
		anchorOffset: blockStart,
		pendingStart,
		pendingEnd: hasFollowing ? pendingStart + 1 : pendingStart,
		atEof: !hasFollowing,
	};
}

export function applyShiftEnterAtBlockEnd(model: EditorModel): boolean {
	if (model.readonlyMode.get() || model.pendingParagraph.get()) {
		return false;
	}
	const selection = model.selection.get();
	if (!selection?.isCollapsed) {
		return false;
	}
	const plan = planShiftEnterAtBlockEnd(model.sourceText.get().value, selection.active, model.document.get());
	if (!plan) {
		return false;
	}
	if (plan.edit) {
		model.applyEdit(plan.edit, Selection.collapsed(plan.pendingStart));
	}
	const anchor = findDeepestBlock(model.document.get(), plan.anchorOffset);
	if (!anchor || (anchor.block.kind !== 'paragraph' && anchor.block.kind !== 'heading')) {
		return false;
	}
	model.armPendingParagraph({
		anchorBlock: anchor.block,
		replaceRange: new OffsetRange(plan.pendingStart, plan.pendingEnd),
		separateFromPreviousBlock: false,
		atEof: plan.atEof,
	});
	return true;
}

function trailingGlueLength(block: BlockAstNode): number {
	const children = block.children;
	let length = 0;
	for (let index = children.length - 1; index >= 0; index--) {
		const child = children[index];
		if (child?.kind !== 'glue') {
			break;
		}
		length += child.length;
	}
	return length;
}

function findDeepestBlock(doc: DocumentAstNode, offset: number): { block: BlockAstNode; start: number } | undefined {
	const found = walk(doc, 0, offset);
	return found ? { block: found.block, start: found.start } : undefined;
}

function walk(node: AstNode, start: number, offset: number): { block: BlockAstNode; start: number } | undefined {
	let found = isBlock(node) && offset >= start && offset < start + node.length
		? { block: node, start }
		: undefined;
	let childStart = start;
	for (const child of node.children) {
		const inner = walk(child, childStart, offset);
		if (inner) {
			found = inner;
		}
		childStart += child.length;
	}
	return found;
}

function isBlock(node: AstNode): node is BlockAstNode {
	return node.kind === 'paragraph'
		|| node.kind === 'heading'
		|| node.kind === 'list'
		|| node.kind === 'blockQuote'
		|| node.kind === 'codeBlock'
		|| node.kind === 'frontMatter'
		|| node.kind === 'table'
		|| node.kind === 'thematicBreak'
		|| node.kind === 'unhandledBlock'
		|| node.kind === 'mathBlock'
		|| node.kind === 'video';
}
