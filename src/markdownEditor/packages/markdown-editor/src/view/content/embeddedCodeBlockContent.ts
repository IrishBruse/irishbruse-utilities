export interface EmbeddedCodeBlockContent {
	readonly text: string;
	readonly sourceOffset: number;
}

export function getEmbeddedCodeBlockContent(source: string): EmbeddedCodeBlockContent {
	const sourceOffset = getLeadingLineBreakLength(source);
	const trailingLength = getTrailingLineBreakLength(source);
	const end = Math.max(sourceOffset, source.length - trailingLength);
	return {
		text: source.slice(sourceOffset, end),
		sourceOffset,
	};
}

function getLeadingLineBreakLength(value: string): number {
	if (value.startsWith('\r\n')) { return 2; }
	if (value.startsWith('\r') || value.startsWith('\n')) { return 1; }
	return 0;
}

function getTrailingLineBreakLength(value: string): number {
	if (value.endsWith('\r\n')) { return 2; }
	if (value.endsWith('\r') || value.endsWith('\n')) { return 1; }
	return 0;
}
