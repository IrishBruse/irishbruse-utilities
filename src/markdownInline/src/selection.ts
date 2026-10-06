import { listGapAfterClass } from "./preview/listItemGap";

export interface SelectionBox {
    top: number;
    left: number;
    width: number;
    height: number;
    styleTop: string;
    styleLeft: string;
    styleBottom: string;
    styleHeight: string;
    styleWidth: string;
    radius: string[];
}

export interface SelectionLine {
    top: number;
    height: number;
    stretchToLineHeight: boolean;
}

function selectionPieceOnLine(piece: SelectionBox, line: SelectionLine): boolean {
    const pieceBottom = piece.top + piece.height;
    const lineBottom = line.top + line.height;
    return pieceBottom > line.top + 0.5 && piece.top < lineBottom - 0.5;
}

export function layoutSelectionPieces(pieces: SelectionBox[], lines: readonly SelectionLine[]): void {
    const stretched = new Set<SelectionBox>();
    for (const line of lines) {
        if (!line.stretchToLineHeight) {
            continue;
        }
        for (const piece of pieces) {
            if (!selectionPieceOnLine(piece, line)) {
                continue;
            }
            stretched.add(piece);
            if (line.height <= piece.height + 0.5 && piece.styleHeight === "") {
                continue;
            }
            piece.styleTop = "0px";
            piece.styleBottom = "auto";
            piece.styleHeight = `${line.height}px`;
        }
    }
    for (const piece of pieces) {
        if (stretched.has(piece) || piece.styleHeight === "") {
            continue;
        }
        piece.styleTop = "0px";
        piece.styleBottom = "0px";
        piece.styleHeight = "";
    }
}

export const selectionHeadingSelector = ".inline-md-h1, .inline-md-h2, .inline-md-h3, .inline-md-h4";

export function extendSelectionAboveLine(piece: SelectionBox, lineHeight: number, zoneHeight: number): void {
    if (zoneHeight <= 0) {
        return;
    }
    piece.styleTop = `${-zoneHeight}px`;
    if (piece.styleHeight !== "") {
        piece.styleHeight = `${lineHeight + zoneHeight}px`;
    }
}

export function extendHeadingSelectionPastText(piece: SelectionBox, textRight: number, padPx: number): void {
    if (padPx <= 0 || piece.width < 1) {
        return;
    }
    const parsed = piece.styleWidth === "" ? piece.width : Number.parseFloat(piece.styleWidth);
    const width = Number.isFinite(parsed) && parsed > 0 ? parsed : piece.width;
    const right = piece.left + width;
    const target = textRight + padPx;
    if (right < textRight - 2 || right >= target - 0.5) {
        return;
    }
    piece.styleWidth = `${Math.round(width + target - right)}px`;
}

export function stretchesSelectionLine(viewLine: {
    querySelector(selector: string): unknown;
    classList: { contains(name: string): boolean };
}): boolean {
    return viewLine.querySelector(selectionHeadingSelector) !== null
        || viewLine.classList.contains(listGapAfterClass);
}

export const dragSelectionClassName = "inline-md-dragging";

let dragging = false;

export function isDragSelecting(): boolean {
    return dragging;
}

export function bindDragSelection(root: HTMLElement, onDragEnd?: () => void): () => void {
    const clear = (): void => {
        if (!dragging) {
            return;
        }
        dragging = false;
        root.classList.remove(dragSelectionClassName);
        onDragEnd?.();
    };

    const onMouseDown = (event: MouseEvent): void => {
        if (event.button !== 0) {
            return;
        }
        dragging = true;
        root.classList.add(dragSelectionClassName);
    };

    const onMouseMove = (event: MouseEvent): void => {
        if ((event.buttons & 1) === 0) {
            clear();
        }
    };

    root.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", clear);
    window.addEventListener("blur", clear);

    return () => {
        root.removeEventListener("mousedown", onMouseDown, true);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", clear);
        window.removeEventListener("blur", clear);
        clear();
    };
}
