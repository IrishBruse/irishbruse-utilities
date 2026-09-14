export interface ITransaction {
	readonly _brand?: undefined;
}

export interface ISettableObservable<T, TChange = void> {
	get(): T;
	set(value: T, tx: ITransaction | undefined, change?: TChange): void;
	recomputeInitiallyAndOnChange(
		store: { add(disposable: { dispose(): void }): unknown },
		handleValue?: (value: T) => void,
	): ISettableObservable<T, TChange>;
}

export function observableValue<T, TChange = void>(
	_debugName: string,
	initial: T,
): ISettableObservable<T, TChange> {
	let value = initial;
	const listeners = new Set<(next: T) => void>();
	const observable: ISettableObservable<T, TChange> = {
		get(): T {
			return value;
		},
		set(next: T, _tx: ITransaction | undefined, _change?: TChange): void {
			if (Object.is(value, next)) {
				return;
			}
			value = next;
			for (const listener of [...listeners]) {
				listener(value);
			}
		},
		recomputeInitiallyAndOnChange(store, handleValue) {
			handleValue?.(value);
			if (handleValue) {
				listeners.add(handleValue);
				store.add({ dispose: () => listeners.delete(handleValue) });
			}
			return observable;
		},
	};
	return observable;
}
