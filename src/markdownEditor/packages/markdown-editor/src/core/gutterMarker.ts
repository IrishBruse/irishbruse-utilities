import type { OffsetRange } from './offsetRange.js';

/**
 * A single gutter marker: a source {@link OffsetRange} tagged with a
 * {@link GutterMarkerType}. The view resolves the range to the visual lines it
 * covers and paints a bar (or, for `deleted`, a wedge at the range position) in
 * the left gutter.
 *
 * A `deleted` marker is normally an empty range (`range.isEmpty`) sitting at the
 * boundary where the removed text used to be — there is nothing left to span,
 * so it is drawn as a caret between lines rather than a bar.
 */
export interface GutterMarker {
	readonly range: OffsetRange;
	readonly type: GutterMarkerType;
}

/**
 * The kind of change a gutter marker represents, mirroring the three states a
 * source-control diff distinguishes (the git change markers in the editor
 * gutter): a freshly inserted region, an edited region, and a point where
 * content was removed.
 */
export type GutterMarkerType = 'added' | 'modified' | 'deleted';
