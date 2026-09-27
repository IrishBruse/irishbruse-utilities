import { defineConfig } from 'vitest/config';
import { markdownEditorAliases } from './src/markdownEditor/markdownEditorAliases.mjs';

export default defineConfig({
	resolve: {
		alias: markdownEditorAliases,
	},
});
