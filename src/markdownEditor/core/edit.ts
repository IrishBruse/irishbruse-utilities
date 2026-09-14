export class OffsetRange {
	constructor(
		readonly start: number,
		readonly endExclusive: number,
	) {}

	get length(): number {
		return Math.max(0, this.endExclusive - this.start);
	}

	delta(offset: number): OffsetRange {
		return new OffsetRange(this.start + offset, this.endExclusive + offset);
	}

	static fromTo(start: number, endExclusive: number): OffsetRange {
		return new OffsetRange(start, endExclusive);
	}

	static ofLength(length: number): OffsetRange {
		return new OffsetRange(0, length);
	}

	static ofStartAndLength(start: number, length: number): OffsetRange {
		return new OffsetRange(start, start + length);
	}
}

export class Selection {
	constructor(
		readonly anchor: number,
		readonly active: number,
	) {}

	get isCollapsed(): boolean {
		return this.anchor === this.active;
	}

	get start(): number {
		return Math.min(this.anchor, this.active);
	}

	get endExclusive(): number {
		return Math.max(this.anchor, this.active);
	}

	get range(): OffsetRange {
		return OffsetRange.fromTo(this.start, this.endExclusive);
	}

	static collapsed(offset: number): Selection {
		return new Selection(offset, offset);
	}
}

export class StringValue {
	constructor(readonly value: string) {}
}

export class StringReplacement {
	constructor(
		readonly replaceRange: OffsetRange,
		readonly newText: string,
	) {}

	static replace(range: OffsetRange, newText: string): StringReplacement {
		return new StringReplacement(range, newText);
	}

	static insert(offset: number, newText: string): StringReplacement {
		return new StringReplacement(OffsetRange.fromTo(offset, offset), newText);
	}
}

export class StringEdit {
	constructor(readonly replacements: readonly StringReplacement[]) {}

	static replace(range: OffsetRange, newText: string): StringEdit {
		return new StringEdit([StringReplacement.replace(range, newText)]);
	}

	static insert(offset: number, newText: string): StringEdit {
		return new StringEdit([StringReplacement.insert(offset, newText)]);
	}

	apply(text: string): string {
		const ordered = [...this.replacements].sort((a, b) => b.replaceRange.start - a.replaceRange.start);
		let next = text;
		for (const replacement of ordered) {
			const { start, endExclusive } = replacement.replaceRange;
			next = next.slice(0, start) + replacement.newText + next.slice(endExclusive);
		}
		return next;
	}
}

export function mapOffsetThroughEdit(offset: number, previous: string, next: string): number {
	let start = 0;
	while (start < previous.length && start < next.length && previous.charCodeAt(start) === next.charCodeAt(start)) {
		start++;
	}
	let previousEnd = previous.length;
	let nextEnd = next.length;
	while (previousEnd > start && nextEnd > start && previous.charCodeAt(previousEnd - 1) === next.charCodeAt(nextEnd - 1)) {
		previousEnd--;
		nextEnd--;
	}
	if (offset <= start) {
		return offset;
	}
	if (offset >= previousEnd) {
		return offset + (next.length - previous.length);
	}
	return nextEnd;
}

export function computeTextEdit(previousText: string, text: string): { start: number; endExclusive: number; text: string } {
	let start = 0;
	while (start < previousText.length && start < text.length && previousText.charCodeAt(start) === text.charCodeAt(start)) {
		start++;
	}
	let previousEnd = previousText.length;
	let end = text.length;
	while (previousEnd > start && end > start && previousText.charCodeAt(previousEnd - 1) === text.charCodeAt(end - 1)) {
		previousEnd--;
		end--;
	}
	return {
		start,
		endExclusive: previousEnd,
		text: text.slice(start, end),
	};
}
