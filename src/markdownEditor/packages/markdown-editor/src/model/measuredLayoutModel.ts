import { derived, observableValue, transaction, type IObservable } from '@vscode/observables';
import type { Rect2D } from '../core/geometry.js';
import type { BlockAstNode } from '../parser/ast.js';
import type { ViewNode } from '../view/content/viewNode.js';
import { VisualLineMap, type VisualLine } from '../view/visualLineMap.js';

/**
 * One block's place in the rendered document.
 *
 * Geometry is in editor-local CSS pixels. `height` is either a real DOM measurement
 * (`isMeasured: true`) or an estimate produced when the block is not
 * currently mounted (`isMeasured: false`). Estimates exist so virtual
 * rendering can size the scroll container without mounting every block.
 *
 * `visualLineMap` and `viewNode` are set only when the block is mounted
 * and measured. Cursor positioning, selection painting and up/down
 * navigation read through `visualLineMap`; the debug view walks
 * `viewNode` to enumerate text leaves for per-character introspection.
 * Unmeasured blocks have neither.
 */
export interface BlockMeasurement {
    readonly block: BlockAstNode;
    readonly absoluteStart: number;
    readonly height: number;
    /** Local border box when mounted and measured. */
    readonly rect: Rect2D | undefined;
    /** Local horizontal padding-box clip when this block scrolls horizontally. */
    readonly viewportClip: { readonly left: number; readonly right: number } | undefined;
    readonly isMeasured: boolean;
    readonly visualLineMap: VisualLineMap | undefined;
    readonly viewNode: ViewNode | undefined;
}

/** A measured source-less line inserted directly after a source block. */
export interface VirtualLineMeasurement {
    readonly afterBlock: BlockAstNode;
    readonly line: VisualLine;
}

/**
 * The set of measurements/estimates the view has produced for the current
 * document. This is the "view → derived facts about layout" channel: the
 * view writes here as a side effect of rendering and measuring; the
 * controller (and selection/cursor rendering) reads from here.
 *
 * Keeping these facts in their own observable model — instead of as ad-hoc
 * fields on the view — preserves the invariant
 *
 *     view(model + Δ) = view(model) + Δ
 *
 * i.e. the view becomes a pure function of (EditorModel, MeasuredLayoutModel).
 * Everything else that depends on layout (controller, commands) goes
 * through this model and never touches view fields directly.
 */
export class MeasuredLayoutModel {
    private readonly _measurements = observableValue<readonly BlockMeasurement[]>(this, []);
    readonly measurements: IObservable<readonly BlockMeasurement[]> = this._measurements;
    private readonly _virtualLines = observableValue<readonly VirtualLineMeasurement[]>(this, []);

    /**
     * Concatenated visual line map across all mounted blocks. Every per-block
     * map uses the same editor-local coordinate space, so concatenation is
     * well-formed without translation or re-sorting.
     */
    readonly visualLineMap = derived(this, reader => {
        const ms = reader.readObservable(this._measurements);
        const virtualLines = reader.readObservable(this._virtualLines);
        const virtualLinesByBlock = new Map<BlockAstNode, VisualLine[]>();
        for (const entry of virtualLines) {
            const lines = virtualLinesByBlock.get(entry.afterBlock);
            if (lines) {
                lines.push(entry.line);
            } else {
                virtualLinesByBlock.set(entry.afterBlock, [entry.line]);
            }
        }
        const lines = ms.flatMap(m => [
            ...(m.visualLineMap?.lines ?? []),
            ...(virtualLinesByBlock.get(m.block) ?? []),
        ]);
        return new VisualLineMap(lines);
    });

    setMeasurements(
        measurements: readonly BlockMeasurement[],
        virtualLines: readonly VirtualLineMeasurement[],
    ): void {
        transaction(tx => {
            this._measurements.set(measurements, tx);
            this._virtualLines.set(virtualLines, tx);
        });
    }
}
