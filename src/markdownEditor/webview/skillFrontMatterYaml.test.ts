import { describe, expect, it } from 'vitest';
import {
	completeSkillPropertyKeys,
	parseSkillFrontMatter,
	serializeSkillFrontMatter,
	skillFrontMatterValueContent,
} from './skillFrontMatterYaml';

describe('parseSkillFrontMatter', () => {
	it('reads required name and description', () => {
		expect(parseSkillFrontMatter('name: code-review\ndescription: Review pull requests.\n')).toEqual([
			{ key: 'name', kind: 'string', value: 'code-review' },
			{ key: 'description', kind: 'string', value: 'Review pull requests.' },
		]);
	});

	it('reads disable-model-invocation as a boolean', () => {
		expect(parseSkillFrontMatter('disable-model-invocation: true\n')).toEqual([
			{ key: 'disable-model-invocation', kind: 'boolean', value: true },
		]);
		expect(parseSkillFrontMatter('disable-model-invocation: false\n')).toEqual([
			{ key: 'disable-model-invocation', kind: 'boolean', value: false },
		]);
	});

	it('reads a folded description', () => {
		const yaml = `description: >-
  Extract text from PDF files. Use when the user mentions PDFs
  or document extraction.
`;
		expect(parseSkillFrontMatter(yaml)).toEqual([
			{
				key: 'description',
				kind: 'string',
				value: 'Extract text from PDF files. Use when the user mentions PDFs or document extraction.',
			},
		]);
	});

	it('keeps unknown keys', () => {
		expect(parseSkillFrontMatter('name: pr\nowner: ethan\n')).toEqual([
			{ key: 'name', kind: 'string', value: 'pr' },
			{ key: 'owner', kind: 'string', value: 'ethan' },
		]);
	});

	it('reads metadata maps', () => {
		expect(parseSkillFrontMatter('metadata:\n  author: ethan\n  version: "2.1"\n')).toEqual([
			{ key: 'metadata', kind: 'map', entries: [ { key: 'author', value: 'ethan' }, { key: 'version', value: '2.1' } ] },
		]);
	});
});

describe('serializeSkillFrontMatter', () => {
	it('round-trips required fields, booleans, and unknown keys', () => {
		const properties = [
			{ key: 'name', kind: 'string' as const, value: 'code-review' },
			{ key: 'description', kind: 'string' as const, value: 'Review pull requests.' },
			{ key: 'disable-model-invocation', kind: 'boolean' as const, value: true },
			{ key: 'owner', kind: 'string' as const, value: 'ethan' },
		];
		const yaml = serializeSkillFrontMatter(properties);
		expect(yaml).toBe([
			'name: code-review',
			'description: Review pull requests.',
			'disable-model-invocation: true',
			'owner: ethan',
			'',
		].join('\n'));
		expect(parseSkillFrontMatter(yaml)).toEqual(properties);
	});

	it('serializes long descriptions as folded YAML', () => {
		const description = 'Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs.';
		const yaml = serializeSkillFrontMatter([ { key: 'description', kind: 'string', value: description } ]);
		expect(yaml.startsWith('description: >-\n')).toBe(true);
		expect(parseSkillFrontMatter(yaml)).toEqual([ { key: 'description', kind: 'string', value: description } ]);
	});
});

describe('completeSkillPropertyKeys', () => {
	it('omits keys already present and filters by prefix', () => {
		expect(completeSkillPropertyKeys([ 'name', 'description' ], '')).toEqual([
			'disable-model-invocation',
			'license',
			'compatibility',
			'allowed-tools',
			'metadata',
		]);
		expect(completeSkillPropertyKeys([ 'name' ], 'dis')).toEqual([ 'disable-model-invocation' ]);
		expect(completeSkillPropertyKeys([ 'license' ], 'l')).toEqual([]);
	});
});

describe('skillFrontMatterValueContent', () => {
	it('keeps the line ending that follows the open fence', () => {
		expect(skillFrontMatterValueContent('name: b\n', '\nname: a\n')).toBe('\nname: b\n');
	});

	it('keeps a CRLF line ending', () => {
		expect(skillFrontMatterValueContent('name: b\n', '\r\nname: a\r\n')).toBe('\r\nname: b\n');
	});

	it('adds a line ending when the previous value has none', () => {
		expect(skillFrontMatterValueContent('name: b\n', '')).toBe('\nname: b\n');
	});
})
