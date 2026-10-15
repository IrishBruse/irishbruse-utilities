import { parseScopes } from "./scopes";
import type { Scope } from "./types";

export const fullPaintLineLimit = 2000;

interface ScopeEntry {
    readonly version: number;
    readonly text: string;
    readonly scopes: readonly Scope[];
}

const entries = new Map<string, ScopeEntry>();

export function cachedScopes(key: string, version: number, read: () => string): ScopeEntry {
    const found = entries.get(key);
    if (found && found.version === version) {
        return found;
    }
    const text = read();
    const entry = { version, text, scopes: parseScopes(text) };
    entries.set(key, entry);
    return entry;
}

export function releaseScopes(key: string): void {
    entries.delete(key);
}
