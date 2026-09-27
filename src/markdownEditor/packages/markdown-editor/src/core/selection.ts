import type { SourceOffset } from './sourceOffset.js';
import { OffsetRange } from './offsetRange.js';

export class Selection {
	static collapsed(offset: SourceOffset): Selection {
		return new Selection(offset, offset);
	}

	constructor(
		readonly anchor: SourceOffset,
		readonly active: SourceOffset,
	) {}

	get isCollapsed(): boolean {
		return this.anchor === this.active;
	}

	get isForward(): boolean {
		return this.active >= this.anchor;
	}

	get range(): OffsetRange {
		return this.isForward
			? new OffsetRange(this.anchor, this.active)
			: new OffsetRange(this.active, this.anchor);
	}

	collapseToActive(): Selection {
		return Selection.collapsed(this.active);
	}

	withActive(active: SourceOffset): Selection {
		return new Selection(this.anchor, active);
	}
}
