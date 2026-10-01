export interface SelectionBox {
    top: number;
    height: number;
    styleTop: string;
    styleBottom: string;
    styleHeight: string;
}

export interface SelectionLine {
    top: number;
    height: number;
    heading: boolean;
}

export function layoutSelectionPieces(pieces: SelectionBox[], lines: readonly SelectionLine[]): void {
    const stretched = new Set<SelectionBox>();
    for (const line of lines) {
        if (!line.heading) {
            continue;
        }
        for (const piece of pieces) {
            if (Math.abs(piece.top - line.top) >= 2) {
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
