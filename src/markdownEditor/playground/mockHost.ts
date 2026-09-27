export interface TextEdit {
    readonly start: number;
    readonly endExclusive: number;
    readonly text: string;
}

/** In-memory markdown document. Edits stay local; undo and redo return the restored text. */
export class MockMarkdownDocument {
    #text: string;
    #undo: string[] = [];
    #redo: string[] = [];

    constructor(text: string) {
        this.#text = text;
    }

    get text(): string {
        return this.#text;
    }

    applyEdit(edit: TextEdit): void {
        const start = clampOffset(edit.start, this.#text.length);
        const endExclusive = clampOffset(edit.endExclusive, this.#text.length);
        const from = Math.min(start, endExclusive);
        const to = Math.max(start, endExclusive);
        this.#undo.push(this.#text);
        this.#redo.length = 0;
        this.#text = this.#text.slice(0, from) + edit.text + this.#text.slice(to);
    }

    undo(): string | undefined {
        const previous = this.#undo.pop();
        if (previous === undefined) {
            return undefined;
        }
        this.#redo.push(this.#text);
        this.#text = previous;
        return this.#text;
    }

    redo(): string | undefined {
        const next = this.#redo.pop();
        if (next === undefined) {
            return undefined;
        }
        this.#undo.push(this.#text);
        this.#text = next;
        return this.#text;
    }
}

export interface PlaygroundSession {
    readonly document: MockMarkdownDocument;
    /** True until the first `ready`, when a fast-open prefix must be replaced by the full text. */
    prefixPainted: boolean;
}

export interface HighlightToken {
    readonly length: number;
    readonly foreground: number;
    readonly fontStyle: number;
}

export type PlaygroundReply =
    | { readonly type: "update"; readonly content: string }
    | {
          readonly type: "highlightResult";
          readonly requestId: number;
          readonly tokens: readonly HighlightToken[];
          readonly colorMap: readonly string[];
      };

/**
 * Answers editor webview messages the way the extension host does:
 * edits are applied and not echoed, undo/redo post the restored text,
 * and highlight requests resolve immediately with unstyled tokens.
 */
export function handlePlaygroundMessage(session: PlaygroundSession, message: unknown): readonly PlaygroundReply[] {
    if (!message || typeof message !== "object") {
        return [];
    }
    const record = message as Record<string, unknown>;
    switch (record.type) {
        case "ready":
            return takeFullTextUpdate(session);
        case "edit":
            return applyEditMessage(session, record);
        case "history":
            return historyMessage(session, record);
        case "highlight":
            return highlightMessage(record);
        default:
            return [];
    }
}

function takeFullTextUpdate(session: PlaygroundSession): readonly PlaygroundReply[] {
    if (!session.prefixPainted) {
        return [];
    }
    session.prefixPainted = false;
    return [{ type: "update", content: session.document.text }];
}

function applyEditMessage(session: PlaygroundSession, record: Record<string, unknown>): readonly PlaygroundReply[] {
    if (typeof record.start !== "number" || typeof record.endExclusive !== "number" || typeof record.text !== "string") {
        return [];
    }
    session.document.applyEdit({
        start: record.start,
        endExclusive: record.endExclusive,
        text: record.text,
    });
    return [];
}

function historyMessage(session: PlaygroundSession, record: Record<string, unknown>): readonly PlaygroundReply[] {
    const next =
        record.command === "undo"
            ? session.document.undo()
            : record.command === "redo"
              ? session.document.redo()
              : undefined;
    if (next === undefined) {
        return [];
    }
    return [{ type: "update", content: next }];
}

function highlightMessage(record: Record<string, unknown>): readonly PlaygroundReply[] {
    if (typeof record.requestId !== "number" || typeof record.source !== "string") {
        return [];
    }
    const source = record.source;
    return [
        {
            type: "highlightResult",
            requestId: record.requestId,
            tokens: source.length > 0 ? [{ length: source.length, foreground: 0, fontStyle: 0 }] : [],
            colorMap: [""],
        },
    ];
}

function clampOffset(offset: number, length: number): number {
    if (!Number.isFinite(offset)) {
        return 0;
    }
    return Math.min(length, Math.max(0, Math.trunc(offset)));
}
