import { parse, preprocess, postprocess } from 'micromark';
import { frontmatter } from 'micromark-extension-frontmatter';
import { math } from 'micromark-extension-math';
import { gfmTable } from 'micromark-extension-gfm-table';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';

export interface MicromarkEvent {
	readonly type: 'enter' | 'exit';
	readonly tokenType: string;
	readonly startOffset: number;
	readonly endOffset: number;
}

export function tokenize(source: string): MicromarkEvent[] {
	const parser = parse({ extensions: [frontmatter(), math(), gfmTable(), gfmTaskListItem(), gfmStrikethrough()] });
	const chunks = preprocess()(source, undefined, true);
	const nativeEvents = postprocess(parser.document().write(chunks));

	return nativeEvents.map(([type, token]) => ({
		type,
		tokenType: token.type,
		startOffset: token.start.offset,
		endOffset: token.end.offset,
	}));
}
