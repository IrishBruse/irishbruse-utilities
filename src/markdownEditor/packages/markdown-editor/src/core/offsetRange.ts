export class OffsetRange {
	public static fromTo(start: number, endExclusive: number): OffsetRange {
		return new OffsetRange(start, endExclusive);
	}

	public static ofLength(length: number): OffsetRange {
		return new OffsetRange(0, length);
	}

	public static ofStartAndLength(start: number, length: number): OffsetRange {
		return new OffsetRange(start, start + length);
	}

	public static emptyAt(offset: number): OffsetRange {
		return new OffsetRange(offset, offset);
	}

	constructor(
		public readonly start: number,
		public readonly endExclusive: number,
	) {
		if (start > endExclusive) {
			throw new Error(`Invalid range: [${start}, ${endExclusive})`);
		}
	}

	get isEmpty(): boolean {
		return this.start === this.endExclusive;
	}

	get length(): number {
		return this.endExclusive - this.start;
	}

	public delta(offset: number): OffsetRange {
		return new OffsetRange(this.start + offset, this.endExclusive + offset);
	}

	public deltaStart(offset: number): OffsetRange {
		return new OffsetRange(this.start + offset, this.endExclusive);
	}

	public deltaEnd(offset: number): OffsetRange {
		return new OffsetRange(this.start, this.endExclusive + offset);
	}

	public contains(offset: number): boolean {
		return this.start <= offset && offset < this.endExclusive;
	}

	public containsRange(other: OffsetRange): boolean {
		return this.start <= other.start && other.endExclusive <= this.endExclusive;
	}

	public intersects(other: OffsetRange): boolean {
		return Math.max(this.start, other.start) < Math.min(this.endExclusive, other.endExclusive);
	}

	public intersectsOrTouches(other: OffsetRange): boolean {
		return Math.max(this.start, other.start) <= Math.min(this.endExclusive, other.endExclusive);
	}

	public intersect(other: OffsetRange): OffsetRange | undefined {
		const start = Math.max(this.start, other.start);
		const end = Math.min(this.endExclusive, other.endExclusive);
		if (start <= end) {
			return new OffsetRange(start, end);
		}
		return undefined;
	}

	public join(other: OffsetRange): OffsetRange {
		return new OffsetRange(
			Math.min(this.start, other.start),
			Math.max(this.endExclusive, other.endExclusive),
		);
	}

	public isBefore(other: OffsetRange): boolean {
		return this.endExclusive <= other.start;
	}

	public isAfter(other: OffsetRange): boolean {
		return this.start >= other.endExclusive;
	}

	public substring(str: string): string {
		return str.substring(this.start, this.endExclusive);
	}

	public slice<T>(arr: readonly T[]): T[] {
		return arr.slice(this.start, this.endExclusive);
	}

	public equals(other: OffsetRange): boolean {
		return this.start === other.start && this.endExclusive === other.endExclusive;
	}

	public toString(): string {
		return `[${this.start}, ${this.endExclusive})`;
	}
}
