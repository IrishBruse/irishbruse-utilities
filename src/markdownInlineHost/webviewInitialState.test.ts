import { describe, expect, it } from 'vitest';
import {
    isSkillMarkdownPath,
    prefixMarkdownForFastOpen,
    skillFolderNameFromPath,
} from './webviewInitialState';

describe('prefixMarkdownForFastOpen', () => {
	it('keeps short files unchanged', () => {
		expect(prefixMarkdownForFastOpen('# hi\n', 16)).toBe('# hi\n');
	});

	it('cuts at the last newline in the budget', () => {
		const text = 'aaa\nbbb\nccc\n';
		expect(prefixMarkdownForFastOpen(text, 8)).toBe('aaa\nbbb\n');
	});
});

describe('isSkillMarkdownPath', () => {
	it('matches SKILL.md at any folder', () => {
		expect(isSkillMarkdownPath('/home/econn/.cursor/skills/pr/SKILL.md')).toBe(true);
		expect(isSkillMarkdownPath('SKILL.md')).toBe(true);
		expect(isSkillMarkdownPath('C:\\skills\\pr\\SKILL.md')).toBe(true);
	});

	it('rejects other markdown files', () => {
		expect(isSkillMarkdownPath('/docs/skill.md')).toBe(false);
		expect(isSkillMarkdownPath('/docs/SKILL.mdx')).toBe(false);
		expect(isSkillMarkdownPath('/docs/README.md')).toBe(false);
	});
});

describe('skillFolderNameFromPath', () => {
	it('uses the parent folder as the skill name', () => {
		expect(skillFolderNameFromPath('/home/econn/.cursor/skills/pr/SKILL.md')).toBe('pr');
		expect(skillFolderNameFromPath('SKILL.md')).toBe('');
	});
});
