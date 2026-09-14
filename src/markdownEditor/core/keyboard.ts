export function lineBounds(source: string, offset: number): { start: number; end: number } {
	const start = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
	const newline = source.indexOf('\n', offset);
	const end = newline === -1 ? source.length : newline;
	return { start, end };
}

const LIST_PREFIX = /^(\s*)([-*+]|\d+\.)(\s+)(?:\[([ xX])\]\s+)?/;

export function applySmartEnter(source: string, offset: number): { start: number; endExclusive: number; text: string; caret: number } {
	const { start, end } = lineBounds(source, offset);
	const line = source.slice(start, end);
	const match = LIST_PREFIX.exec(line);
	if (match) {
		const marker = match[0];
		const rest = line.slice(marker.length);
		if (rest.length === 0 && offset <= end) {
			return {
				start,
				endExclusive: Math.min(source.length, end + (source[end] === '\n' ? 1 : 0)),
				text: '',
				caret: start,
			};
		}
		const insert = `\n${marker}`;
		return {
			start: offset,
			endExclusive: offset,
			text: insert,
			caret: offset + insert.length,
		};
	}
	const insert = '\n\n';
	return {
		start: offset,
		endExclusive: offset,
		text: insert,
		caret: offset + insert.length,
	};
}

export function applyHardBreak(offset: number): { start: number; endExclusive: number; text: string; caret: number } {
	const text = '  \n';
	return {
		start: offset,
		endExclusive: offset,
		text,
		caret: offset + text.length,
	};
}

export function toggleTaskAt(source: string, offset: number, checked: boolean): { start: number; endExclusive: number; text: string } | undefined {
	const { start, end } = lineBounds(source, offset);
	const line = source.slice(start, end);
	const match = /\[([ xX])\]/.exec(line);
	if (!match || match.index === undefined) {
		return undefined;
	}
	const boxStart = start + match.index;
	return {
		start: boxStart,
		endExclusive: boxStart + 3,
		text: checked ? '[x]' : '[ ]',
	};
}

export function deleteSelectionOrBackward(source: string, selStart: number, selEnd: number): { start: number; endExclusive: number; text: string; caret: number } {
	if (selEnd > selStart) {
		return { start: selStart, endExclusive: selEnd, text: '', caret: selStart };
	}
	if (selStart === 0) {
		return { start: 0, endExclusive: 0, text: '', caret: 0 };
	}
	const prev = source.codePointAt(selStart - 1) ?? 0;
	const width = prev > 0xffff ? 2 : 1;
	const start = selStart - width;
	return { start, endExclusive: selStart, text: '', caret: start };
}

export function deleteSelectionOrForward(source: string, selStart: number, selEnd: number): { start: number; endExclusive: number; text: string; caret: number } {
	if (selEnd > selStart) {
		return { start: selStart, endExclusive: selEnd, text: '', caret: selStart };
	}
	if (selStart >= source.length) {
		return { start: selStart, endExclusive: selStart, text: '', caret: selStart };
	}
	const next = source.codePointAt(selStart) ?? 0;
	const width = next > 0xffff ? 2 : 1;
	return { start: selStart, endExclusive: selStart + width, text: '', caret: selStart };
}
