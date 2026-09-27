/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//
// Geometry for comments anchored to the editor's right edge. Comments stack so
// they never overlap one another, though they may overlap editor text.
//

import type { SelectionRect } from '../../view/parts/selectionView.js';
import type { EditorView } from '../../view/editorView.js';

/** A card to place: its DOM element and the rects of its anchored source range. */
export interface StackItem {
    readonly element: HTMLElement;
    readonly rects: readonly SelectionRect[];
}

/** Vertical gap between stacked cards. */
export const RAIL_GAP = 12;
/** Inset of each card's right edge from the editor's right edge. */
export const RIGHT_INSET = 8;

/**
 * Right-align and vertically stack `items`. The overlay layer lives inside the
 * centered, max-width content box, so the editor-relative right edge is
 * converted to overlay-local coordinates via `offsetLeft`. Pure DOM writes over
 * already-resolved rects, so the caller decides when to run it (an autorun for
 * comment/reflow changes, a ResizeObserver for width changes).
 *
 * Cards whose range has not been measured yet (no rects) are hidden rather than
 * parked at the top-left, so there is no flash before the editor's first
 * measurement anchors them.
 */
export function layoutRightAlignedStack(view: EditorView, items: readonly StackItem[]): void {
    const el = view.element;
    const overlay = view.overlayContainer;
    const rightEdge = (el.clientWidth - RIGHT_INSET) - overlay.offsetLeft;

    const placed: { element: HTMLElement; y: number }[] = [];
    for (const item of items) {
        item.element.style.setProperty('--md-comment-available-width', `${Math.max(0, rightEdge)}px`);
        if (item.rects.length === 0) {
            // Not measured yet — hide (keeps layout box, so offsetWidth stays
            // valid) until a re-run has real geometry to anchor to.
            item.element.style.visibility = 'hidden';
            continue;
        }
        item.element.style.visibility = '';
        placed.push({ element: item.element, y: Math.min(...item.rects.map(r => r.y)) });
    }

    placed.sort((a, b) => a.y - b.y);

    let prevBottom = -Infinity;
    for (const p of placed) {
        const top = Math.max(p.y, prevBottom + RAIL_GAP);
        const left = rightEdge - p.element.offsetWidth;
        p.element.style.left = `${left}px`;
        p.element.style.top = `${top}px`;
        prevBottom = top + p.element.offsetHeight;
    }
}
