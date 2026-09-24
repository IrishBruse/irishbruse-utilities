/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Thin bridge for values we create and hand to `@vscode/markdown-editor`.
 * The editor bundle still depends on `@vscode/observables` internally; webview
 * sources that import it directly are this module and `disposable.ts`.
 */
export {
	observableValue,
	type ISettableObservable,
	type ITransaction,
} from '@vscode/observables';
