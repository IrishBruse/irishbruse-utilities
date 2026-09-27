import { OffsetRange } from './offsetRange.js';

export class StringValue {
	constructor(readonly value: string) {}

	get length(): number {
		return this.value.length;
	}

	public substring(range: OffsetRange): string {
		return range.substring(this.value);
	}

	public toString(): string {
		return this.value;
	}
}
