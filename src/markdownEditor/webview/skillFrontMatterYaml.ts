export const SKILL_FRONT_MATTER_KEYS = [
	'name',
	'description',
	'disable-model-invocation',
	'license',
	'compatibility',
	'allowed-tools',
	'metadata',
] as const;

export type SkillFieldWidget = 'text' | 'multiline' | 'boolean' | 'map';

export interface SkillMapEntry {
	key: string;
	value: string;
}

export type SkillProperty =
	| { readonly key: string; readonly kind: 'string'; value: string }
	| { readonly key: string; readonly kind: 'boolean'; value: boolean }
	| { readonly key: string; readonly kind: 'map'; entries: SkillMapEntry[] };

export function widgetForKey(key: string): SkillFieldWidget {
	if (key === 'description') {
		return 'multiline';
	}
	if (key === 'disable-model-invocation') {
		return 'boolean';
	}
	if (key === 'metadata') {
		return 'map';
	}
	return 'text';
}

export function emptyProperty(key: string): SkillProperty {
	const widget = widgetForKey(key);
	if (widget === 'boolean') {
		return { key, kind: 'boolean', value: true };
	}
	if (widget === 'map') {
		return { key, kind: 'map', entries: [] };
	}
	return { key, kind: 'string', value: '' };
}

export function completeSkillPropertyKeys(existingKeys: readonly string[], prefix: string): string[] {
	const used = new Set(existingKeys);
	const needle = prefix.toLowerCase();
	return SKILL_FRONT_MATTER_KEYS.filter(key => !used.has(key) && key.startsWith(needle));
}

export function parseSkillFrontMatter(yaml: string): SkillProperty[] {
	const lines = yaml.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
	const properties: SkillProperty[] = [];
	let index = 0;
	while (index < lines.length) {
		const line = lines[index] ?? '';
		if (line.trim() === '' || line.trimStart().startsWith('#')) {
			index += 1;
			continue;
		}
		const match = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
		if (!match) {
			index += 1;
			continue;
		}
		const key = match[1] ?? '';
		const rest = match[2] ?? '';
		if (widgetForKey(key) === 'map' || rest === '{}' || nextLineIsMapEntry(lines, index + 1)) {
			if (isBlockScalarIndicator(rest)) {
				const block = readBlockScalar(lines, index + 1, rest);
				properties.push({ key, kind: 'string', value: block.value });
				index = block.next;
				continue;
			}
			if (rest === '{}' || rest === '') {
				const mapped = readMapEntries(lines, index + 1);
				properties.push({ key, kind: 'map', entries: mapped.entries });
				index = mapped.next;
				continue;
			}
		}
		if (isBlockScalarIndicator(rest)) {
			const block = readBlockScalar(lines, index + 1, rest);
			properties.push({ key, kind: 'string', value: block.value });
			index = block.next;
			continue;
		}
		if (widgetForKey(key) === 'boolean') {
			properties.push({ key, kind: 'boolean', value: rest === 'true' || rest === 'yes' || rest === 'on' });
			index += 1;
			continue;
		}
		properties.push({ key, kind: 'string', value: unquoteScalar(rest) });
		index += 1;
	}
	return properties;
}

export function serializeSkillFrontMatter(properties: readonly SkillProperty[]): string {
	const lines: string[] = [];
	for (const property of properties) {
		if (property.kind === 'boolean') {
			lines.push(`${property.key}: ${property.value ? 'true' : 'false'}`);
			continue;
		}
		if (property.kind === 'map') {
			const entries = property.entries.filter(entry => entry.key.length > 0);
			if (entries.length === 0) {
				lines.push(`${property.key}: {}`);
				continue;
			}
			lines.push(`${property.key}:`);
			for (const entry of entries) {
				lines.push(`  ${entry.key}: ${dumpInlineScalar(entry.value)}`);
			}
			continue;
		}
		lines.push(...dumpKeyedString(property.key, property.value, property.key === 'description'));
	}
	return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

function nextLineIsMapEntry(lines: readonly string[], start: number): boolean {
	for (let index = start; index < lines.length; index++) {
		const line = lines[index] ?? '';
		if (line.trim() === '') {
			continue;
		}
		return /^\s+[A-Za-z0-9_-]+:/.test(line);
	}
	return false;
}

function isBlockScalarIndicator(rest: string): boolean {
	return /^[|>][+-]?$/.test(rest);
}

function readMapEntries(lines: readonly string[], start: number): { entries: SkillMapEntry[]; next: number } {
	const entries: SkillMapEntry[] = [];
	let index = start;
	while (index < lines.length) {
		const line = lines[index] ?? '';
		if (line.trim() === '') {
			index += 1;
			continue;
		}
		const match = /^\s+([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
		if (!match) {
			break;
		}
		entries.push({ key: match[1] ?? '', value: unquoteScalar(match[2] ?? '') });
		index += 1;
	}
	return { entries, next: index };
}

function readBlockScalar(lines: readonly string[], start: number, indicator: string): { value: string; next: number } {
	const folded = indicator.startsWith('>');
	const chomp = indicator.includes('-') ? 'strip' : indicator.includes('+') ? 'keep' : 'clip';
	const raw: string[] = [];
	let index = start;
	while (index < lines.length) {
		const line = lines[index] ?? '';
		if (line.trim() === '') {
			raw.push(line);
			index += 1;
			continue;
		}
		if (!/^[ \t]/.test(line)) {
			break;
		}
		raw.push(line);
		index += 1;
	}
	const indent = minIndent(raw);
	const body = raw.map(line => line.trim() === '' ? '' : line.slice(indent));
	let value = folded ? foldBlock(body) : body.join('\n');
	if (chomp === 'strip') {
		value = value.replace(/\n+$/u, '');
	} else if (chomp === 'clip') {
		value = value.replace(/\n+$/u, '') + (body.length > 0 ? '\n' : '');
	}
	return { value, next: index };
}

function minIndent(lines: readonly string[]): number {
	let indent = Number.POSITIVE_INFINITY;
	for (const line of lines) {
		if (line.trim() === '') {
			continue;
		}
		const match = /^[ \t]*/.exec(line);
		const length = match?.[0].length ?? 0;
		if (length < indent) {
			indent = length;
		}
	}
	return Number.isFinite(indent) ? indent : 0;
}

function foldBlock(lines: readonly string[]): string {
	const paragraphs: string[] = [];
	let current: string[] = [];
	const flush = (): void => {
		if (current.length > 0) {
			paragraphs.push(current.join(' '));
			current = [];
		}
	};
	for (const line of lines) {
		if (line === '') {
			flush();
			continue;
		}
		current.push(line.trim());
	}
	flush();
	return paragraphs.join('\n');
}

function unquoteScalar(raw: string): string {
	if ((raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2)
		|| (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)) {
		const inner = raw.slice(1, -1);
		if (raw.startsWith('"')) {
			return inner.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
		}
		return inner.replace(/''/g, "'");
	}
	return raw;
}

function dumpInlineScalar(value: string): string {
	if (value === '') {
		return '""';
	}
	if (/[\n:#&*!{}[\],'"|>]/.test(value) || /^(?:true|false|null|yes|no|on|off)$/i.test(value) || /^\s|\s$/.test(value)) {
		return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
	}
	return value;
}

function dumpKeyedString(key: string, value: string, preferFolded: boolean): string[] {
	if (value.includes('\n')) {
		return [ `${key}: |`, ...value.split('\n').map(line => `  ${line}`) ];
	}
	if (preferFolded && value.length > 80) {
		return [ `${key}: >-`, ...wrapFolded(value).map(line => `  ${line}`) ];
	}
	return [ `${key}: ${dumpInlineScalar(value)}` ];
}

function wrapFolded(value: string, width = 80): string[] {
	const words = value.split(/\s+/).filter(word => word.length > 0);
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		const next = current.length === 0 ? word : `${current} ${word}`;
		if (next.length > width && current.length > 0) {
			lines.push(current);
			current = word;
		} else {
			current = next;
		}
	}
	if (current.length > 0) {
		lines.push(current);
	}
	return lines.length > 0 ? lines : [ '' ];
}
