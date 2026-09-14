/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DisposableStore } from './disposable';

/** Subset of `@vscode/observables` used by `@vscode/markdown-editor` model fields. */
export interface ObservableLike<T> {
	get(): T;
	recomputeInitiallyAndOnChange(
		store: DisposableStore,
		handleValue?: (value: T) => void,
	): ObservableLike<T>;
}

/** Re-run `run` when any listed observable changes. */
export function observeAll(
	store: DisposableStore,
	run: () => void,
	...observables: readonly ObservableLike<unknown>[]
): void {
	for (const observable of observables) {
		observable.recomputeInitiallyAndOnChange(store, run);
	}
}
