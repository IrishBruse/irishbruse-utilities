/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IDisposable {
	dispose(): void;
}

export class DisposableStore implements IDisposable {
	private readonly disposables = new Set<IDisposable>();
	private _isDisposed = false;

	get isDisposed(): boolean {
		return this._isDisposed;
	}

	dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables.clear();
	}

	add<T extends IDisposable | undefined>(disposable: T): T {
		if (!disposable) {
			return disposable;
		}
		if (this._isDisposed) {
			console.warn('Adding to disposed DisposableStore');
			disposable.dispose();
			return disposable;
		}
		this.disposables.add(disposable);
		return disposable;
	}
}

export abstract class Disposable implements IDisposable {
	protected readonly _store = new DisposableStore();

	dispose(): void {
		this._store.dispose();
	}

	protected _register<T extends IDisposable>(disposable: T): T {
		return this._store.add(disposable);
	}
}
