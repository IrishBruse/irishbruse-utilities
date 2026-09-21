export function lineBounds(source: string, offset: number): { start: number; end: number } {
	const start = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
	const newline = source.indexOf('\n', offset);
	const end = newline === -1 ? source.length : newline;
	return { start, end };
}

/** Line range for triple-click: line text plus trailing `\n` when present. */
export function lineSelectionBounds(source: string, offset: number): { start: number; endExclusive: number } {
	const { start, end } = lineBounds(source, offset);
	const endExclusive = source[end] === '\n' ? end + 1 : end;
	return { start, endExclusive };
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}_]/u;

function clampOffset(source: string, offset: number): number {
	return Math.max(0, Math.min(offset, source.length));
}

function codeUnitWidthAt(source: string, index: number): number {
	const cp = source.codePointAt(index) ?? 0;
	return cp > 0xffff ? 2 : 1;
}

function isLowSurrogateTail(source: string, index: number): boolean {
	return index > 0 && source.codePointAt(index - 1)! > 0xffff;
}

function wordCharIndex(source: string, offset: number): number {
	let index = clampOffset(source, offset);
	if (index === source.length && index > 0) {
		index -= codeUnitWidthAt(source, index - 1);
	}
	if (isLowSurrogateTail(source, index)) {
		index -= 1;
	}
	return index;
}

function isWordCharAt(source: string, index: number): boolean {
	if (index < 0 || index >= source.length) {
		return false;
	}
	const width = codeUnitWidthAt(source, index);
	return WORD_CHAR.test(source.slice(index, index + width));
}

function expandWordBounds(source: string, index: number): { start: number; end: number } {
	let start = index;
	while (start > 0 && isWordCharAt(source, start - codeUnitWidthAt(source, start - 1))) {
		start -= codeUnitWidthAt(source, start - 1);
	}
	let end = index + codeUnitWidthAt(source, index);
	while (end < source.length && isWordCharAt(source, end)) {
		end += codeUnitWidthAt(source, end);
	}
	return { start, end };
}

export function wordBounds(text: string, offset: number): { start: number; end: number } {
	if (text.length === 0) {
		return { start: 0, end: 0 };
	}
	const clamped = clampOffset(text, offset);
	const index = wordCharIndex(text, clamped);
	const width = codeUnitWidthAt(text, index);
	const unit = text.slice(index, index + width);
	if (isWordCharAt(text, index)) {
		return expandWordBounds(text, index);
	}
	if (!/\s/.test(unit)) {
		return { start: index, end: index + width };
	}
	for (let i = index - 1; i >= 0; i -= codeUnitWidthAt(text, i)) {
		if (/\s/.test(text[i])) {
			continue;
		}
		if (isWordCharAt(text, i)) {
			return expandWordBounds(text, i);
		}
		break;
	}
	for (let i = index + width; i < text.length; i += codeUnitWidthAt(text, i)) {
		if (/\s/.test(text[i])) {
			continue;
		}
		if (isWordCharAt(text, i)) {
			return expandWordBounds(text, i);
		}
		break;
	}
	return { start: clamped, end: clamped };
}

function unitRange(bounds: { start: number; end: number }, fallback: number): { start: number; end: number } {
	if (bounds.end > bounds.start) {
		return bounds;
	}
	return { start: fallback, end: fallback };
}

/** Word-by-word range while the pointer is down after a double-click. */
export function dragWordSelection(
	source: string,
	originOffset: number,
	pointerOffset: number,
): { anchor: number; active: number } {
	const origin = unitRange(wordBounds(source, originOffset), originOffset);
	const pointer = unitRange(wordBounds(source, pointerOffset), pointerOffset);
	if (pointerOffset >= originOffset) {
		return { anchor: origin.start, active: Math.max(origin.end, pointer.end) };
	}
	return { anchor: origin.end, active: Math.min(origin.start, pointer.start) };
}

/** Line-by-line range while the pointer is down after a triple-click. */
export function dragLineSelection(
	source: string,
	originOffset: number,
	pointerOffset: number,
): { anchor: number; active: number } {
	const origin = lineSelectionBounds(source, originOffset);
	const pointer = lineSelectionBounds(source, pointerOffset);
	if (pointerOffset >= originOffset) {
		return { anchor: origin.start, active: Math.max(origin.endExclusive, pointer.endExclusive) };
	}
	return { anchor: origin.endExclusive, active: Math.min(origin.start, pointer.start) };
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

export type InlineWrapEdit = {
	readonly start: number;
	readonly endExclusive: number;
	readonly text: string;
	readonly anchor: number;
	readonly active: number;
};

function countCharRun(source: string, index: number, direction: -1 | 1, ch: string): number {
	let count = 0;
	if (direction < 0) {
		for (let i = index - 1; i >= 0 && source[i] === ch; i--) {
			count++;
		}
		return count;
	}
	for (let i = index; i < source.length && source[i] === ch; i++) {
		count++;
	}
	return count;
}

function markerIsRepeatedChar(marker: string): boolean {
	const unit = marker[0];
	return marker.length > 0 && unit !== undefined && marker.split('').every(ch => ch === unit);
}

/**
 * Wrap or unwrap an inline Markdown marker around the selection.
 * A collapsed caret wraps the word under the caret, or inserts a marker pair.
 */
export function toggleInlineWrap(source: string, selStart: number, selEnd: number, marker: string): InlineWrapEdit {
	let start = Math.max(0, Math.min(selStart, selEnd, source.length));
	let end = Math.max(0, Math.min(Math.max(selStart, selEnd), source.length));
	if (marker.length === 0) {
		return { start, endExclusive: end, text: source.slice(start, end), anchor: start, active: end };
	}

	if (start === end) {
		const word = wordBounds(source, start);
		if (word.end > word.start) {
			start = word.start;
			end = word.end;
		} else {
			return {
				start,
				endExclusive: end,
				text: marker + marker,
				anchor: start + marker.length,
				active: start + marker.length,
			};
		}
	}

	const inner = source.slice(start, end);
	const need = marker.length;
	if (inner.startsWith(marker) && inner.endsWith(marker) && inner.length >= need * 2) {
		const stripped = inner.slice(need, inner.length - need);
		return {
			start,
			endExclusive: end,
			text: stripped,
			anchor: start,
			active: start + stripped.length,
		};
	}

	if (markerIsRepeatedChar(marker)) {
		const unit = marker[0] ?? '';
		const left = countCharRun(source, start, -1, unit);
		const right = countCharRun(source, end, 1, unit);
		const italicParity = need > 1 || (left % 2 === 1 && right % 2 === 1);
		if (left >= need && right >= need && italicParity) {
			const unwrapStart = start - need;
			const unwrapEnd = end + need;
			return {
				start: unwrapStart,
				endExclusive: unwrapEnd,
				text: inner,
				anchor: unwrapStart,
				active: unwrapStart + inner.length,
			};
		}
	} else if (
		source.slice(Math.max(0, start - need), start) === marker
		&& source.slice(end, end + need) === marker
	) {
		const unwrapStart = start - need;
		const unwrapEnd = end + need;
		return {
			start: unwrapStart,
			endExclusive: unwrapEnd,
			text: inner,
			anchor: unwrapStart,
			active: unwrapStart + inner.length,
		};
	}

	return {
		start,
		endExclusive: end,
		text: marker + inner + marker,
		anchor: start + need,
		active: start + need + inner.length,
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
