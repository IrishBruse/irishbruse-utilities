#!/usr/bin/env node
/**
 * Download large real-world Markdown files for Markdown Editor stress tests.
 * Output: docs/tests/markdown/large/ (gitignored except README.md)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, 'large');

/** @type {{ name: string; url: string; note: string }[]} */
export const LARGE_FIXTURES = [
	{
		name: 'reltio-docs.md',
		url: 'https://raw.githubusercontent.com/reltio-ai/reltio-ai-ready-docs/main/docs.md',
		note: '~14 MB Reltio product docs corpus (3k+ topics, tables, code fences)',
	},
	{
		name: 'reltio-index.md',
		url: 'https://raw.githubusercontent.com/reltio-ai/reltio-ai-ready-docs/main/index.md',
		note: '~3.7 MB contextual retrieval index for the Reltio corpus',
	},
	{
		name: 'awesome-selfhosted.md',
		url: 'https://raw.githubusercontent.com/awesome-selfhosted/awesome-selfhosted/master/README.md',
		note: '~320 KB awesome list with deep TOC and thousands of table rows',
	},
	{
		name: 'stylelint-changelog.md',
		url: 'https://raw.githubusercontent.com/stylelint/stylelint/main/CHANGELOG.md',
		note: '~265 KB keep-a-changelog style release history with links',
	},
	{
		name: 'cirosantilli-readme-large.md',
		url: 'https://raw.githubusercontent.com/cirosantilli/test-md-readme-large/master/README.md',
		note: '~1 MB synthetic README (~128k short lines; GitHub render-limit stress test)',
	},
	{
		name: 'mdn-array.md',
		url: 'https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/javascript/reference/global_objects/array/index.md',
		note: '~50 KB MDN reference page (tables, code, front matter, spec links)',
	},
];

function formatBytes(bytes) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadFixture({ name, url }) {
	const dest = join(outDir, name);
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${url} → HTTP ${response.status}`);
	}
	const text = await response.text();
	await writeFile(dest, text, 'utf8');
	const lines = text.split('\n').length;
	return { name, bytes: Buffer.byteLength(text, 'utf8'), lines };
}

async function main() {
	const only = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
	const selected =
		only.length > 0
			? LARGE_FIXTURES.filter(fixture => only.includes(fixture.name))
			: LARGE_FIXTURES;

	if (selected.length === 0) {
		console.error('No fixtures matched. Available:');
		for (const fixture of LARGE_FIXTURES) {
			console.error(`  ${fixture.name}`);
		}
		process.exit(1);
	}

	await mkdir(outDir, { recursive: true });

	console.log(`Downloading ${selected.length} fixture(s) to ${outDir}\n`);
	const results = [];
	for (const fixture of selected) {
		process.stdout.write(`  ${fixture.name} ... `);
		try {
			const result = await downloadFixture(fixture);
			results.push(result);
			console.log(`${formatBytes(result.bytes)}, ${result.lines.toLocaleString()} lines`);
		} catch (error) {
			console.log('FAILED');
			console.error(`    ${error instanceof Error ? error.message : error}`);
			process.exitCode = 1;
		}
	}

	if (results.length > 0) {
		const totalBytes = results.reduce((sum, row) => sum + row.bytes, 0);
		console.log(`\nDone. ${results.length} file(s), ${formatBytes(totalBytes)} total.`);
		console.log('Open with Reopen Editor With → Markdown Editor (ib-utilities).');
	}
}

main();
