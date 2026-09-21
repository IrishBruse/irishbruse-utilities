export type ActiveSourceStyle = 'marker' | 'strong' | 'em' | 'code' | 'link' | 'strike' | '';

export function headingMarkerPrefix(text: string): string {
	return /^( {0,3}#{1,6}[ \t]+)/.exec(text)?.[0] ?? '';
}

/** Ordered/bullet marker or blockquote prefix at the start of a source line. */
export function lineMarkerPrefix(line: string): string {
	return /^(\s*)([-*+]|\d{1,9}[.)])(\s+)/.exec(line)?.[0]
		?? /^( {0,3}>\s?)/.exec(line)?.[0]
		?? '';
}

export function headingSourceForEdit(text: string): string {
	return text.replace(/\n$/, '');
}

export function headingDisplayText(source: string): string {
	return source.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\s+#+\s*$/, '').trimEnd();
}

export function headingBodyStart(source: string): number {
	const body = headingDisplayText(source);
	if (body.length === 0) {
		return headingMarkerPrefix(source).length;
	}
	const at = source.indexOf(body);
	return at === -1 ? headingMarkerPrefix(source).length : at;
}

export function activeSourceStyles(text: string, inline: boolean): readonly ActiveSourceStyle[] {
	const out: ActiveSourceStyle[] = Array.from({ length: text.length }, () => '');
	if (!inline || text.length === 0) {
		return out;
	}
	let index = 0;
	while (index < text.length) {
		const newline = text.indexOf('\n', index);
		const end = newline === -1 ? text.length : newline;
		styleLine(text, index, end, out);
		index = newline === -1 ? text.length : newline + 1;
	}
	return out;
}

function fill(out: ActiveSourceStyle[], start: number, end: number, style: ActiveSourceStyle): void {
	for (let i = start; i < end && i < out.length; i++) {
		out[i] = style;
	}
}

function styleLine(text: string, start: number, end: number, out: ActiveSourceStyle[]): void {
	const line = text.slice(start, end);
	if (/^#{1,6}\s/.test(line)) {
		return;
	}
	const list = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)/.exec(line);
	if (list) {
		fill(out, start, start + list[0].length, 'marker');
		styleInline(text, start + list[0].length, end, out);
		return;
	}
	const quote = /^( {0,3}>\s?)/.exec(line);
	if (quote) {
		fill(out, start, start + quote[0].length, 'marker');
		styleInline(text, start + quote[0].length, end, out);
		return;
	}
	styleInline(text, start, end, out);
}

function findClose(text: string, from: number, end: number, delimiter: string): number {
	let i = from;
	while (i + delimiter.length <= end) {
		if (text[i] === '\\') {
			i += 2;
			continue;
		}
		if (text.slice(i, i + delimiter.length) === delimiter) {
			return i;
		}
		i++;
	}
	return -1;
}

function styleInline(text: string, start: number, end: number, out: ActiveSourceStyle[]): void {
	let i = start;
	while (i < end) {
		if (text[i] === '\\' && i + 1 < end) {
			i += 2;
			continue;
		}
		if (text[i] === '`') {
			const close = text.indexOf('`', i + 1);
			if (close > i && close < end) {
				fill(out, i, close + 1, 'code');
				i = close + 1;
				continue;
			}
		}
		if (text.startsWith('~~', i)) {
			const close = findClose(text, i + 2, end, '~~');
			if (close > i) {
				fill(out, i, close + 2, 'strike');
				i = close + 2;
				continue;
			}
		}
		if (text.startsWith('**', i) || text.startsWith('__', i)) {
			const delimiter = text.slice(i, i + 2);
			const close = findClose(text, i + 2, end, delimiter);
			if (close > i) {
				fill(out, i, close + delimiter.length, 'strong');
				i = close + delimiter.length;
				continue;
			}
		}
		if (text[i] === '*' || text[i] === '_') {
			const delimiter = text[i] ?? '*';
			const close = findClose(text, i + 1, end, delimiter);
			if (close > i) {
				fill(out, i, close + 1, 'em');
				i = close + 1;
				continue;
			}
		}
		if (text[i] === '[') {
			const match = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(text.slice(i, end));
			if (match) {
				fill(out, i, i + match[0].length, 'link');
				i += match[0].length;
				continue;
			}
		}
		i++;
	}
}

export function styleClassName(style: ActiveSourceStyle): string {
	if (style === 'marker') {
		return 'md-marker';
	}
	if (style === 'strong') {
		return 'md-strong';
	}
	if (style === 'em') {
		return 'md-emphasis';
	}
	if (style === 'code') {
		return 'md-inline-code';
	}
	if (style === 'link') {
		return 'md-link';
	}
	if (style === 'strike') {
		return 'md-strikethrough';
	}
	return '';
}
