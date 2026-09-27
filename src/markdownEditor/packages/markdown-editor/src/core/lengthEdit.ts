import { OffsetRange } from './offsetRange.js';

/**
 * A single "the text in `replaceRange` now spans `newLength` characters"
 * statement. Unlike {@link StringReplacement} it carries no text — it only
 * describes *where* and *by how much* something changed, not *what to*.
 *
 * For syntax highlighting it means: the characters that used to occupy
 * `replaceRange` are replaced by `newLength` characters whose tokens may now
 * be coloured differently. A same-length replacement (`replaceRange.length ===
 * newLength`) therefore means "these characters kept their positions but got
 * re-coloured".
 */
export class LengthReplacement {
    public static replace(replaceRange: OffsetRange, newLength: number): LengthReplacement {
        return new LengthReplacement(replaceRange, newLength);
    }

    constructor(
        public readonly replaceRange: OffsetRange,
        public readonly newLength: number,
    ) {
        if (newLength < 0) {
            throw new Error(`newLength must be non-negative, got ${newLength}`);
        }
    }

    get lengthDelta(): number {
        return this.newLength - this.replaceRange.length;
    }

    public equals(other: LengthReplacement): boolean {
        return this.replaceRange.equals(other.replaceRange) && this.newLength === other.newLength;
    }

    public toString(): string {
        return `${this.replaceRange} -> +${this.newLength}`;
    }
}

/**
 * A set of disjoint, sorted {@link LengthReplacement}s — the length-only
 * counterpart of {@link StringEdit}. Used as the change reason of an
 * observable so observers learn which offset ranges of the previous value map
 * to which ranges of the new value (and thus what to invalidate) without
 * carrying the new content itself.
 */
export class LengthEdit {
    public static readonly empty = new LengthEdit([]);

    public static single(replacement: LengthReplacement): LengthEdit {
        return new LengthEdit([replacement]);
    }

    public static replace(replaceRange: OffsetRange, newLength: number): LengthEdit {
        return new LengthEdit([LengthReplacement.replace(replaceRange, newLength)]);
    }

    public readonly replacements: readonly LengthReplacement[];

    constructor(replacements: readonly LengthReplacement[]) {
        let lastEndEx = -1;
        for (const r of replacements) {
            if (r.replaceRange.start < lastEndEx) {
                throw new Error(`Edits must be disjoint and sorted. Found ${r} after end ${lastEndEx}`);
            }
            lastEndEx = r.replaceRange.endExclusive;
        }
        this.replacements = replacements;
    }

    get isEmpty(): boolean {
        return this.replacements.length === 0;
    }

    public equals(other: LengthEdit): boolean {
        if (this.replacements.length !== other.replacements.length) {
            return false;
        }
        for (let i = 0; i < this.replacements.length; i++) {
            if (!this.replacements[i].equals(other.replacements[i])) {
                return false;
            }
        }
        return true;
    }

    public toString(): string {
        return this.isEmpty ? 'LengthEdit.empty' : this.replacements.join(', ');
    }
}
