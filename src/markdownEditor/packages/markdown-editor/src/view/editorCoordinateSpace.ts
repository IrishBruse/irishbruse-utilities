import { Point2D, Rect2D } from '../core/geometry.js';

const MATRIX_EPSILON = 1e-7;

/**
 * The editor overlay's local CSS-pixel coordinate space.
 *
 * Browser geometry and pointer APIs expose viewport client coordinates. This
 * boundary converts them immediately into the coordinate system shared by the
 * editor content and its overlays. Range rectangles are axis-aligned, so the
 * current implementation deliberately supports positive axis-aligned scale and
 * translation only.
 */
export class EditorCoordinateSpace {
	static forSvgOverlay(overlay: SVGSVGElement): EditorCoordinateSpace {
		return new EditorCoordinateSpace(() => {
			// EditorView performs an initial render before callers mount its root.
			// There is no client coordinate space while detached, so measurements
			// are already local. Mounting changes the observed content size and
			// triggers the normal measured-layout refresh.
			if (!overlay.isConnected) { return new DOMMatrix(); }
			const matrix = overlay.getScreenCTM();
			if (!matrix) {
				throw new Error('Cannot resolve editor coordinates before the overlay is mounted');
			}
			return matrix;
		});
	}

	private constructor(private readonly _getLocalToClientMatrix: () => DOMMatrix) { }

	capture(): EditorCoordinateTransform {
		const localToClient = this._getLocalToClientMatrix();
		if (localToClient.is2D === false
			|| Math.abs(localToClient.b) > MATRIX_EPSILON
			|| Math.abs(localToClient.c) > MATRIX_EPSILON
			|| localToClient.a <= MATRIX_EPSILON
			|| localToClient.d <= MATRIX_EPSILON) {
			throw new Error('Markdown editor geometry supports positive axis-aligned scale and translation only');
		}
		return new EditorCoordinateTransform(localToClient);
	}
}

/** A stable coordinate conversion captured for one measurement operation. */
export class EditorCoordinateTransform {
	private readonly _clientToLocal: DOMMatrix;

	constructor(private readonly _localToClient: DOMMatrix) {
		this._clientToLocal = _localToClient.inverse();
	}

	toLocalPoint(point: Pick<Point2D, 'x' | 'y'>): Point2D {
		const local = new DOMPoint(point.x, point.y).matrixTransform(this._clientToLocal);
		return new Point2D(local.x, local.y);
	}

	toClientPoint(point: Pick<Point2D, 'x' | 'y'>): Point2D {
		const client = new DOMPoint(point.x, point.y).matrixTransform(this._localToClient);
		return new Point2D(client.x, client.y);
	}

	toLocalRect(rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>): Rect2D {
		return this._convertRect(rect, this._clientToLocal);
	}

	toClientRect(rect: Pick<Rect2D, 'left' | 'top' | 'width' | 'height'>): Rect2D {
		return this._convertRect(rect, this._localToClient);
	}

	private _convertRect(
		rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>,
		matrix: DOMMatrix,
	): Rect2D {
		const topLeft = new DOMPoint(rect.left, rect.top).matrixTransform(matrix);
		const bottomRight = new DOMPoint(rect.left + rect.width, rect.top + rect.height).matrixTransform(matrix);
		return Rect2D.fromPointPoint(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
	}
}
