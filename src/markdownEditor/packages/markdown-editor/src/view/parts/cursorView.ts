import { Disposable, autorun, derived, type IObservable } from '@vscode/observables';
import { Rect2D } from '../../core/geometry.js';
import { CursorPosition, type CursorPosition as CursorPositionType } from '../../core/cursorPosition.js';
import type { VisualLineMap } from '../visualLineMap.js';
import { blockViewportClip, blockContainingOffset, type SelectionBlock } from './selectionView.js';

export interface CursorViewOptions {
    readonly position: IObservable<CursorPositionType | undefined>;
    readonly visualLineMap: IObservable<VisualLineMap>;
    /**
     * The mounted blocks, used to hide the caret when it sits at an offset that
     * has been scrolled out of its (horizontally scrolling) block's viewport —
     * matching how the selection is clipped there.
     */
    readonly blocks?: IObservable<readonly SelectionBlock[]>;
}

/**
 * Owns the blinking cursor DOM element.
 *
 * The rendering pipeline is a single `derived` whose compute callback
 * asks the {@link VisualLineMap} for the caret rect at the current source or
 * virtual position, writes it to {@link element}, and returns a
 * {@link CursorViewRendering} value as proof. An autorun keeps the
 * derived subscribed.
 */
export class CursorView extends Disposable {
    readonly element: HTMLElement;
    readonly rendering: IObservable<CursorViewRendering>;

    constructor(options: CursorViewOptions) {
        super();
        this.element = document.createElement('div');
        this.element.className = 'md-cursor';

        this.rendering = derived(this, reader => {
            const position = reader.readObservable(options.position);
            const visualLineMap = reader.readObservable(options.visualLineMap);
            if (position === undefined || visualLineMap.isEmpty) {
                this.element.style.display = 'none';
                return new CursorViewRendering(position ?? CursorPosition.source(0), false, Rect2D.EMPTY);
            }
            const lineIdx = visualLineMap.lineIndexOfPosition(position);
            if (lineIdx === undefined) {
                this.element.style.display = 'none';
                return new CursorViewRendering(position, false, Rect2D.EMPTY);
            }
            const caretRect = visualLineMap.lineRect(lineIdx).withZeroWidthAt(visualLineMap.xAtPosition(position));

            // Hide the caret when it sits in a horizontally-scrolling block and
            // has been scrolled outside that block's viewport, so it doesn't
            // float over the editor the way an unclipped selection rect would.
            const blocks = options.blocks ? reader.readObservable(options.blocks) : undefined;
            const clip = blocks && position.kind === 'source'
                ? blockViewportClip(blockContainingOffset(blocks, position.offset))
                : undefined;
            if (clip && (caretRect.x < clip.left - 0.5 || caretRect.x > clip.right + 0.5)) {
                this.element.style.display = 'none';
                return new CursorViewRendering(position, false, Rect2D.EMPTY);
            }

            this.element.style.left = `${caretRect.x}px`;
            this.element.style.top = `${caretRect.y}px`;
            this.element.style.height = `${caretRect.height}px`;
            this.element.style.display = '';
            return new CursorViewRendering(position, true, caretRect);
        });

        this._register(autorun(reader => { reader.readObservable(this.rendering); }));

        this._register(autorun(reader => {
            reader.readObservable(options.position);
            this.element.style.animation = 'none';
            void this.element.offsetWidth;
            this.element.style.animation = '';
        }));
    }
}

export class CursorViewRendering {
    constructor(
        readonly position: CursorPositionType,
        readonly visible: boolean,
        readonly rect: Rect2D,
    ) { }
}
