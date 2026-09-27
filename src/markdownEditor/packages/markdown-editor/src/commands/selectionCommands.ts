import { OffsetRange } from '../core/offsetRange.js';
import { Selection } from '../core/selection.js';
import { findWordAt } from '../core/wordUtils.js';
import type { CursorCommandContext, SelectionCommand } from './types.js';

export const selectAll: SelectionCommand = (ctx) =>
	new Selection(0, ctx.text.length);

export const selectWord: SelectionCommand = (_ctx, offset) => {
	const word = findWordAt(_ctx.text, offset, _ctx.wordNavigationConfig);
	return new Selection(word.start, word.end);
};

export function selectBlock(ctx: CursorCommandContext, blockRange: OffsetRange): Selection {
	return new Selection(blockRange.start, blockRange.endExclusive);
}
