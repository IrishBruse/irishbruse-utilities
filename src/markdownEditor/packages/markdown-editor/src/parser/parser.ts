import { StringValue } from '../core/stringValue.js';
import type { StringEdit } from '../core/stringEdit.js';
import { DocumentAstNode } from './ast.js';
import { parseIncremental } from './reconcile.js';

/**
 * Parses markdown into a {@link DocumentAstNode}.
 *
 * When given the `previous` document and the `edit` that produced the new
 * text, it reuses unchanged subtrees and carries node identities across the
 * edit (see {@link parseIncremental}), so views can diff cheaply and code
 * blocks keep their incremental highlighting sessions.
 */
export class MarkdownParser {
	parse(text: StringValue, previous?: DocumentAstNode, edit?: StringEdit): DocumentAstNode {
		return parseIncremental(text.value, previous, edit);
	}
}
