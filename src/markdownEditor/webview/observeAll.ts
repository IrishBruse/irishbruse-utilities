

import type { DisposableStore } from './disposable';


export interface ObservableLike<T> {
	get(): T;
	recomputeInitiallyAndOnChange(
		store: DisposableStore,
		handleValue?: (value: T) => void,
	): ObservableLike<T>;
}


export function observeAll(
	store: DisposableStore,
	run: () => void,
	...observables: readonly ObservableLike<unknown>[]
): void {
	for (const observable of observables) {
		observable.recomputeInitiallyAndOnChange(store, run);
	}
}
