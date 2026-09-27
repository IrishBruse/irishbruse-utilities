import { OffsetRange } from '../core/offsetRange.js';
import {
	BlockQuoteAstNode, GlueAstNode, ListAstNode, ListItemAstNode, MarkerAstNode, VideoAstNode,
	type BlockAstNode, type DocumentAstNode, type AstNode,
} from '../parser/ast.js';

interface BlockRangeEntry {
	readonly block: BlockAstNode;
	readonly index: number;
	readonly start: number;
	readonly hiddenRanges: readonly OffsetRange[];
	readonly containsList: boolean;
}

interface DocumentRangeCache {
	readonly entries: readonly BlockRangeEntry[];
	readonly entryByBlock: ReadonlyMap<BlockAstNode, BlockRangeEntry>;
	readonly rangesByVisibilityKey: Map<string, readonly OffsetRange[]>;
}

const documentRangeCaches = new WeakMap<DocumentAstNode, DocumentRangeCache>();
const listItemRangeCaches = new WeakMap<ListAstNode, readonly ListItemRangeEntry[]>();
const MAX_VISIBILITY_CACHE_ENTRIES = 64;

interface ListItemRangeEntry {
	readonly item: ListAstNode['items'][number];
	readonly index: number;
	readonly start: number;
	readonly endExclusive: number;
}

/**
 * Move the cursor one position left or right, skipping over hidden source
 * ranges in inactive blocks (and inactive items of an active list).
 */
export function nextCursorPosition(
	doc: DocumentAstNode,
	markerVisibleBlocks: ReadonlySet<BlockAstNode>,
	cursor: number,
	direction: 'left' | 'right',
	selectionRange: OffsetRange = OffsetRange.emptyAt(cursor),
): number {
	const target = direction === 'right' ? cursor + 1 : cursor - 1;
	return normalizeCursorPosition(doc, markerVisibleBlocks, cursor, target, direction, true, selectionRange);
}

export function normalizeCursorPosition(
	doc: DocumentAstNode,
	markerVisibleBlocks: ReadonlySet<BlockAstNode>,
	cursor: number,
	target: number,
	direction: 'left' | 'right',
	includeHiddenRangeBoundary = true,
	selectionRange: OffsetRange = OffsetRange.emptyAt(cursor),
): number {
	target = Math.min(Math.max(target, 0), doc.length);
	const hiddenRanges = hiddenCursorRanges(doc, markerVisibleBlocks, selectionRange);
	if (direction === 'right') {
		for (let index = firstRangeEndingAtOrAfter(hiddenRanges, target); index < hiddenRanges.length; index++) {
			const range = hiddenRanges[index];
			if (range.start > target) { break; }
			if (range.contains(target) || (includeHiddenRangeBoundary && range.start === target)) {
				target = range.endExclusive;
			}
		}
	} else {
		for (let index = lastRangeStartingAtOrBefore(hiddenRanges, target); index >= 0; index--) {
			const range = hiddenRanges[index];
			if (range.endExclusive < target) { break; }
			if (range.contains(target) || (includeHiddenRangeBoundary && range.endExclusive === target)) {
				target = range.start;
			}
		}
	}
	return target;
}

export function hiddenCursorRanges(
	doc: DocumentAstNode,
	markerVisibleBlocks: ReadonlySet<BlockAstNode>,
	selectionRange: OffsetRange,
): readonly OffsetRange[] {
	const cache = getDocumentRangeCache(doc);
	const visibilityKey = getVisibilityKey(cache, markerVisibleBlocks, selectionRange);
	const cached = cache.rangesByVisibilityKey.get(visibilityKey);
	if (cached) {
		cache.rangesByVisibilityKey.delete(visibilityKey);
		cache.rangesByVisibilityKey.set(visibilityKey, cached);
		return cached;
	}

	const result: OffsetRange[] = [];
	const entriesWithNestedVisibility = new Set<BlockRangeEntry>();
	for (const block of markerVisibleBlocks) {
		const entry = cache.entryByBlock.get(block);
		if (entry && entry.block !== block) { entriesWithNestedVisibility.add(entry); }
	}
	for (const entry of cache.entries) {
		if (!markerVisibleBlocks.has(entry.block)) {
			result.push(...(entriesWithNestedVisibility.has(entry)
				? collectMarkerRanges(entry.block, markerVisibleBlocks).map(range => range.delta(entry.start))
				: entry.hiddenRanges));
		} else if (entry.containsList) {
			for (const range of collectActiveBlockHiddenRanges(
				entry.block,
				selectionRange.delta(-entry.start),
				markerVisibleBlocks,
			)) {
				result.push(range.delta(entry.start));
			}
		}
	}
	cache.rangesByVisibilityKey.set(visibilityKey, result);
	if (cache.rangesByVisibilityKey.size > MAX_VISIBILITY_CACHE_ENTRIES) {
		cache.rangesByVisibilityKey.delete(cache.rangesByVisibilityKey.keys().next().value!);
	}
	return result;
}

function getDocumentRangeCache(doc: DocumentAstNode): DocumentRangeCache {
	let cache = documentRangeCaches.get(doc);
	if (cache) { return cache; }

	const blocks = new Set(doc.blocks);
	const entries: BlockRangeEntry[] = [];
	const entryByBlock = new Map<BlockAstNode, BlockRangeEntry>();
	let start = 0;
	for (const child of doc.children) {
		if (blocks.has(child as BlockAstNode)) {
			const block = child as BlockAstNode;
			const entry: BlockRangeEntry = {
				block,
				index: entries.length,
				start,
				hiddenRanges: collectMarkerRanges(block).map(range => range.delta(start)),
				containsList: containsList(block),
			};
			entries.push(entry);
			entryByBlock.set(block, entry);
			indexNestedVideos(block, entry, entryByBlock);
		}
		start += child.length;
	}
	cache = { entries, entryByBlock, rangesByVisibilityKey: new Map() };
	documentRangeCaches.set(doc, cache);
	return cache;
}

function indexNestedVideos(
	node: AstNode,
	entry: BlockRangeEntry,
	entryByBlock: Map<BlockAstNode, BlockRangeEntry>,
): void {
	for (const child of node.children) {
		if (child instanceof VideoAstNode) {
			entryByBlock.set(child, entry);
		} else if (
			child instanceof BlockQuoteAstNode
			|| child instanceof ListAstNode
			|| child instanceof ListItemAstNode
		) {
			indexNestedVideos(child, entry, entryByBlock);
		}
	}
}

function getVisibilityKey(
	cache: DocumentRangeCache,
	markerVisibleBlocks: ReadonlySet<BlockAstNode>,
	selectionRange: OffsetRange,
): string {
	const visibleEntries: string[] = [];
	for (const block of markerVisibleBlocks) {
		const entry = cache.entryByBlock.get(block);
		if (!entry) {
			visibleEntries.push(`nested:${block.id}`);
			continue;
		}
		if (entry.block !== block) {
			visibleEntries.push(`${entry.index}:nested:${block.id}`);
			continue;
		}
		const listState = entry.containsList
			? activeListVisibilityKey(block, selectionRange.delta(-entry.start))
			: '';
		visibleEntries.push(`${entry.index}:${listState}`);
	}
	visibleEntries.sort();
	return visibleEntries.join(',');
}

function firstRangeEndingAtOrAfter(ranges: readonly OffsetRange[], offset: number): number {
	let low = 0;
	let high = ranges.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (ranges[middle].endExclusive < offset) {
			low = middle + 1;
		} else {
			high = middle;
		}
	}
	return low;
}

function lastRangeStartingAtOrBefore(ranges: readonly OffsetRange[], offset: number): number {
	let low = 0;
	let high = ranges.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (ranges[middle].start <= offset) {
			low = middle + 1;
		} else {
			high = middle;
		}
	}
	return low - 1;
}

export function findActiveListItemIndex(list: ListAstNode, cursorOffset: number): number | undefined {
    const entries = listItemRanges(list);
    let low = 0;
    let high = entries.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (entries[middle].start <= cursorOffset) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    const candidate = entries[low - 1];
    return candidate && cursorOffset <= candidate.endExclusive ? candidate.index : undefined;
}

function collectActiveBlockHiddenRanges(
	block: BlockAstNode,
	selectionRange: OffsetRange,
	markerVisibleBlocks: ReadonlySet<BlockAstNode>,
): OffsetRange[] {
    const ranges: OffsetRange[] = [];
    walkActiveBlockHiddenRanges(block, 0, selectionRange, ranges, markerVisibleBlocks);
    ranges.sort((a, b) => a.start - b.start);
    return ranges;
}

function walkActiveBlockHiddenRanges(
	node: AstNode,
	offset: number,
	selectionRange: OffsetRange,
	ranges: OffsetRange[],
	markerVisibleBlocks: ReadonlySet<BlockAstNode>,
): void {
    if (!containsList(node)) { return; }
    if (node.kind !== 'list') {
        let childOffset = offset;
        for (const child of node.children) {
            walkActiveBlockHiddenRanges(child, childOffset, selectionRange, ranges, markerVisibleBlocks);
            childOffset += child.length;
        }
        return;
    }

    const list = node as ListAstNode;
    const activeItemIndices = activeListItemIndices(list, selectionRange.delta(-offset));
    for (const entry of listItemRanges(list)) {
        if (activeItemIndices.has(entry.index)) {
            walkActiveBlockHiddenRanges(entry.item, offset + entry.start, selectionRange, ranges, markerVisibleBlocks);
        } else {
            walkCollectMarkerRanges(entry.item, offset + entry.start, ranges, markerVisibleBlocks);
        }
    }
}

function activeListVisibilityKey(block: BlockAstNode, selectionRange: OffsetRange): string {
    const state: string[] = [];
    const visit = (node: AstNode, offset: number): void => {
        if (!containsList(node)) { return; }
        if (node.kind === 'list') {
            const list = node as ListAstNode;
            const activeItemIndices = activeListItemIndices(list, selectionRange.delta(-offset));
            state.push(`${node.id}:${[...activeItemIndices].join('.')}`);
            for (const activeItemIndex of activeItemIndices) {
                const activeItem = listItemRanges(list)[activeItemIndex];
                if (activeItem) { visit(activeItem.item, offset + activeItem.start); }
            }
            return;
        }
        let childOffset = offset;
        for (const child of node.children) {
            visit(child, childOffset);
            childOffset += child.length;
        }
    };
    visit(block, 0);
    return state.join(',');
}

function activeListItemIndices(list: ListAstNode, selectionRange: OffsetRange): ReadonlySet<number> {
    if (selectionRange.isEmpty) {
        const activeItemIndex = findActiveListItemIndex(list, selectionRange.start);
        return activeItemIndex === undefined ? _EMPTY_ITEM_INDICES : new Set([activeItemIndex]);
    }
    const active = new Set<number>();
    for (const entry of listItemRanges(list)) {
        if (entry.start < selectionRange.endExclusive && entry.endExclusive > selectionRange.start) {
            active.add(entry.index);
        }
    }
    return active;
}

const _EMPTY_ITEM_INDICES: ReadonlySet<number> = new Set();

function listItemRanges(list: ListAstNode): readonly ListItemRangeEntry[] {
    const cached = listItemRangeCaches.get(list);
    if (cached) { return cached; }

    const items = list.items;
    const entries: ListItemRangeEntry[] = [];
    let itemIndex = 0;
    let offset = 0;
    for (const child of list.children) {
        const item = items[itemIndex];
        if (child === item) {
            entries.push({
                item,
                index: itemIndex,
                start: offset,
                endExclusive: offset + item.length,
            });
            itemIndex++;
        }
        offset += child.length;
    }
    listItemRangeCaches.set(list, entries);
    return entries;
}

const containsListCaches = new WeakMap<AstNode, boolean>();

function containsList(node: AstNode): boolean {
    const cached = containsListCaches.get(node);
    if (cached !== undefined) { return cached; }
    const result = node.kind === 'list' || node.children.some(containsList);
    containsListCaches.set(node, result);
    return result;
}

function collectMarkerRanges(block: BlockAstNode, markerVisibleBlocks?: ReadonlySet<BlockAstNode>): OffsetRange[] {
    const ranges: OffsetRange[] = [];
    walkCollectMarkerRanges(block, 0, ranges, markerVisibleBlocks);
    ranges.sort((a, b) => a.start - b.start);
    return ranges;
}

function walkCollectMarkerRanges(
	node: AstNode,
	offset: number,
	ranges: OffsetRange[],
	markerVisibleBlocks?: ReadonlySet<BlockAstNode>,
): void {
	if (node instanceof VideoAstNode && markerVisibleBlocks?.has(node)) {
		return;
	}
    if (node.children.length === 0) {
        if (node instanceof MarkerAstNode || isHiddenGlue(node)) {
            ranges.push(OffsetRange.ofStartAndLength(offset, node.length));
        }
        return;
    }

    switch (node.kind) {
        case 'frontMatter':
        case 'codeBlock':
        case 'mathBlock': {
            let childOffset = offset;
            for (const child of node.children) {
                if (child instanceof MarkerAstNode && (child.markerKind === 'openFence' || child.markerKind === 'closeFence')) {
                    ranges.push(OffsetRange.ofStartAndLength(childOffset, child.length));
                } else if (isHiddenGlue(child)) {
                    ranges.push(OffsetRange.ofStartAndLength(childOffset, child.length));
                }
                childOffset += child.length;
            }
            return;
        }
        case 'inlineCode':
        case 'inlineMath': {
            let childOffset = offset;
            for (const child of node.children) {
                if (child instanceof MarkerAstNode && (child.markerKind === 'openMarker' || child.markerKind === 'closeMarker')) {
                    ranges.push(OffsetRange.ofStartAndLength(childOffset, child.length));
                } else if (isHiddenGlue(child)) {
                    ranges.push(OffsetRange.ofStartAndLength(childOffset, child.length));
                }
                childOffset += child.length;
            }
            return;
        }
        case 'thematicBreak':
            collectHiddenGlueChildren(node, offset, ranges);
            return;
        case 'video':
            ranges.push(OffsetRange.ofStartAndLength(offset, node.length));
            return;
        case 'unhandledBlock':
            // The raw `content` marker is real, always-visible text (not
            // hideable markup), but trailing quote-source glue is hidden.
            collectHiddenGlueChildren(node, offset, ranges);
            return;
        case 'image': {
            ranges.push(OffsetRange.ofStartAndLength(offset, node.length));
            return;
        }
    }

    function collectHiddenGlueChildren(node: AstNode, offset: number, ranges: OffsetRange[]): void {
        let childOffset = offset;
        for (const child of node.children) {
            if (isHiddenGlue(child)) {
                ranges.push(OffsetRange.ofStartAndLength(childOffset, child.length));
            }
            childOffset += child.length;
        }
    }

    function isHiddenGlue(node: AstNode): node is GlueAstNode {
        return node instanceof GlueAstNode
            && (node.glueKind === 'blockQuoteLineBreak' || node.glueKind === 'blockQuoteSourceGap');
    }

    let childOffset = offset;
    for (const child of node.children) {
        walkCollectMarkerRanges(child, childOffset, ranges, markerVisibleBlocks);
        childOffset += child.length;
    }
}
