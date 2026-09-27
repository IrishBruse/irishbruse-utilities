import type { CursorPosition } from '../core/cursorPosition.js';
import type { Selection } from '../core/selection.js';
import type { SourceOffset } from '../core/sourceOffset.js';
import type { StringEdit } from '../core/stringEdit.js';
import type { WordNavigationConfig } from '../core/wordUtils.js';
import type { BlockAstNode, DocumentAstNode } from '../parser/ast.js';
import type { VisualLineMap } from '../view/visualLineMap.js';

export interface CursorCommandContext {
	readonly text: string;
	readonly selection: Selection;
	readonly document: DocumentAstNode;
	readonly activeBlock: BlockAstNode | undefined;
	readonly markerVisibleBlocks: ReadonlySet<BlockAstNode>;
	readonly wordNavigationConfig: WordNavigationConfig;
	readonly cursorPosition: CursorPosition;
}

export type CursorCommand = (ctx: CursorCommandContext) => CursorPosition;

export interface CursorMoveResult {
	readonly position: CursorPosition;
	readonly desiredColumn: number | undefined;
}

export interface VisualCursorCommandContext extends CursorCommandContext {
	readonly lineMap: VisualLineMap;
	readonly desiredColumn: number | undefined;
}

export type VisualCursorCommand = (ctx: VisualCursorCommandContext) => CursorMoveResult;

export type EditCommand = (ctx: CursorCommandContext) => {
	readonly edit: StringEdit;
	readonly selection: Selection;
} | undefined;

export type SelectionCommand = (ctx: CursorCommandContext, offset: SourceOffset) => Selection;
