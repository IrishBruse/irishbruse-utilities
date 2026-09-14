export type BlockKind =
	| 'paragraph'
	| 'heading'
	| 'list'
	| 'code'
	| 'table'
	| 'blockquote'
	| 'thematicBreak'
	| 'frontMatter'
	| 'math'
	| 'unhandledBlock';

export interface SourceNode {
	readonly id: number;
	readonly start: number;
	readonly end: number;
	readonly length: number;
}

export class MdBlock implements SourceNode {
	constructor(
		readonly id: number,
		readonly kind: BlockKind,
		readonly start: number,
		readonly end: number,
	) {}

	get length(): number {
		return this.end - this.start;
	}
}

export class FrontMatterValueNode implements SourceNode {
	constructor(
		readonly id: number,
		readonly start: number,
		readonly end: number,
		readonly content: string,
	) {}

	get length(): number {
		return this.end - this.start;
	}
}

export class FrontMatterAstNode extends MdBlock {
	constructor(
		id: number,
		start: number,
		end: number,
		readonly value: FrontMatterValueNode | undefined,
		readonly openFence: { readonly content: string } | undefined,
	) {
		super(id, 'frontMatter', start, end);
	}
}

export class TableAstNode extends MdBlock {
	constructor(id: number, start: number, end: number) {
		super(id, 'table', start, end);
	}
}

export class CodeBlockAstNode extends MdBlock {
	constructor(
		id: number,
		start: number,
		end: number,
		readonly language: string,
		readonly codeOffset: number,
		readonly code: string,
	) {
		super(id, 'code', start, end);
	}
}

export class HtmlFlowAstNode extends MdBlock {
	readonly tokenType = 'htmlFlow';
	readonly htmlComment = undefined;
	constructor(
		id: number,
		start: number,
		end: number,
		readonly code: { readonly content: string },
	) {
		super(id, 'unhandledBlock', start, end);
	}
}

export class DefinitionAstNode extends MdBlock {
	readonly tokenType = 'definition';
	constructor(id: number, start: number, end: number) {
		super(id, 'unhandledBlock', start, end);
	}
}

export class HeadingAstNode extends MdBlock {
	constructor(
		id: number,
		start: number,
		end: number,
		readonly depth: number,
	) {
		super(id, 'heading', start, end);
	}
}

export class ListAstNode extends MdBlock {
	constructor(id: number, start: number, end: number) {
		super(id, 'list', start, end);
	}
}

export type BlockAstNode = MdBlock;

export interface DocumentAstNode {
	readonly kind: 'document';
	readonly blocks: readonly MdBlock[];
	readonly length: number;
}

export function emptyDocument(): DocumentAstNode {
	return { kind: 'document', blocks: [], length: 0 };
}
