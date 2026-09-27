import { defineConfig } from 'vitest/config';
import { markdownEditorAliases } from './esbuild.mjs';

export default defineConfig({
	resolve: {
		alias: markdownEditorAliases,
	},
});
