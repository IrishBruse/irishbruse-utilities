import type { DocumentAstNode, MdBlock } from './ast';

export function findNodeOffsetById(doc: DocumentAstNode, node: { readonly id: number; readonly start?: number }): number | undefined {
	if (typeof node.start === 'number') {
		for (const block of doc.blocks) {
			if (block.id === node.id) {
				return block.start;
			}
			if (block.kind === 'frontMatter' && 'value' in block) {
				const value = (block as { value?: { id: number; start: number } }).value;
				if (value && value.id === node.id) {
					return value.start;
				}
			}
		}
		return node.start;
	}
	for (const block of doc.blocks) {
		if (block.id === node.id) {
			return block.start;
		}
	}
	return undefined;
}

export function findBlockAtOffset(doc: DocumentAstNode, offset: number): MdBlock | undefined {
	let fallback: MdBlock | undefined;
	for (const block of doc.blocks) {
		if (offset < block.start) {
			return fallback;
		}
		if (offset < block.end || (offset === block.end && offset === doc.length && block.end === doc.length)) {
			fallback = block;
			if (offset < block.end) {
				return block;
			}
		}
		if (offset === block.end) {
			fallback = block;
		}
	}
	return fallback;
}

export function blocksIntersecting(doc: DocumentAstNode, start: number, endExclusive: number): MdBlock[] {
	const end = Math.max(start, endExclusive);
	const hits: MdBlock[] = [];
	for (const block of doc.blocks) {
		if (block.end > start && block.start < end) {
			hits.push(block);
		} else if (start === end && start >= block.start && start <= block.end) {
			hits.push(block);
		}
	}
	if (hits.length === 0 && start === end) {
		const at = findBlockAtOffset(doc, start);
		if (at) {
			hits.push(at);
		}
	}
	return hits;
}
