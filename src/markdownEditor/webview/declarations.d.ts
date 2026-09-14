/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module '*.css';
declare module 'katex' {
	const katex: {
		render(source: string, element: HTMLElement, options?: { displayMode?: boolean; throwOnError?: boolean }): void;
	};
	export default katex;
}
