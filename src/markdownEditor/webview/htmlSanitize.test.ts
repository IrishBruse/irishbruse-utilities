import { describe, expect, it } from 'vitest';
import { htmlPreviewKind, isDangerousHtmlSource } from './htmlSanitize';

describe('htmlPreviewKind', () => {
	it('uses painted HTML when the sanitizer keeps markup', () => {
		expect(htmlPreviewKind('<div>Note</div>', '<div>Note</div>')).toBe('html');
	});

	it('falls back to raw source when nothing remains to paint', () => {
		expect(htmlPreviewKind('<foo>', '')).toBe('raw');
		expect(htmlPreviewKind('<>', '')).toBe('raw');
	});

	it('keeps the warning chrome for stripped dangerous tags', () => {
		expect(htmlPreviewKind('<script>alert(1)</script>', '')).toBe('warning');
	});
});

describe('isDangerousHtmlSource', () => {
	it('detects stripped tags', () => {
		expect(isDangerousHtmlSource('<iframe src="https://example.com"></iframe>')).toBe(true);
		expect(isDangerousHtmlSource('<span>ok</span>')).toBe(false);
	});
});
