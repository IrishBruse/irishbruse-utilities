/**
 * Immutable point in a caller-defined 2D CSS-pixel coordinate space.
 * Coordinate-owning APIs must document whether values are viewport-client or
 * editor-local; values from different spaces must not be mixed.
 */
export class Point2D {
    static readonly ZERO = new Point2D(0, 0);

    constructor(
        readonly x: number,
        readonly y: number,
    ) { }

    translate(dx: number, dy: number): Point2D {
        return new Point2D(this.x + dx, this.y + dy);
    }
}

/**
 * Immutable axis-aligned rectangle in a caller-defined 2D CSS-pixel coordinate
 * space. `x`/`y` is the top-left corner, growing right/down.
 *
 * Half-open in both dimensions: `right` and `bottom` are excluded.
 */
export class Rect2D {
    static readonly EMPTY = new Rect2D(0, 0, 0, 0);

    static fromPointPoint(left: number, top: number, right: number, bottom: number): Rect2D {
        return new Rect2D(left, top, right - left, bottom - top);
    }

    static fromPointSize(x: number, y: number, width: number, height: number): Rect2D {
        return new Rect2D(x, y, width, height);
    }

    private constructor(
        readonly x: number,
        readonly y: number,
        readonly width: number,
        readonly height: number,
    ) { }

    get left(): number { return this.x; }
    get top(): number { return this.y; }
    get right(): number { return this.x + this.width; }
    get bottom(): number { return this.y + this.height; }

    get topLeft(): Point2D { return new Point2D(this.x, this.y); }

    containsX(x: number): boolean { return x >= this.left && x < this.right; }
    containsY(y: number): boolean { return y >= this.top && y < this.bottom; }
    containsPoint(p: Point2D): boolean { return this.containsX(p.x) && this.containsY(p.y); }

    /** Same y/height, zero-width band at `x = this.left`. Useful for caret rects derived from a line. */
    withZeroWidthAt(x: number): Rect2D {
        return new Rect2D(x, this.y, 0, this.height);
    }

    translate(dx: number, dy: number): Rect2D {
        return new Rect2D(this.x + dx, this.y + dy, this.width, this.height);
    }
}
