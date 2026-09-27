import { observableValue, type ISettableObservable, type ITransaction } from '@vscode/observables';
import type { MonarchTokenizer, IMonarchTokenizerState } from 'monaco-editor/esm/vs/editor/standalone/common/monarch/monarchLexer.js';
import { OffsetRange } from '../core/offsetRange.js';
import { StringEdit } from '../core/stringEdit.js';
import { LengthEdit } from '../core/lengthEdit.js';
import { Token, type ISyntaxHighlightedSnapshot, type ISyntaxHighlighterDocument, type ISyntaxHighlighter, type SnapshotTokens } from './syntaxHighlighter.js';

/**
 * The slice of monaco's Monarch internals the highlighter needs at runtime.
 *
 * `monaco-editor` is only a *type* dependency of this package; the caller (who
 * owns a real monaco runtime) passes these in, keeping monaco out of the bundle.
 */
export interface IMonarchApi {
    /** Compiles a Monarch language definition into the internal lexer form. */
    compile(languageId: string, json: unknown): unknown;
    MonarchTokenizer: new (
        languageService: unknown,
        standaloneThemeService: unknown,
        languageId: string,
        lexer: unknown,
        configurationService: unknown,
    ) => MonarchTokenizer;
}

/**
 * {@link ISyntaxHighlighter} backed by monaco's Monarch tokenizer.
 *
 * Highlighting is synchronous and incremental: an edit only re-runs the
 * tokenizer from the first changed line onward (earlier lines and their saved
 * end-states are reused), and the {@link LengthEdit} delivered with the new
 * snapshot is the minimal char range whose colour actually changed.
 *
 * Only Monarch's *classic* tokenizer path is used, which needs neither a theme
 * nor the DOM, so this runs headless (Node, workers) as well as in the browser.
 */
export class MonacoSyntaxHighlighter implements ISyntaxHighlighter {
    private readonly _tokenizers = new Map<string, MonarchTokenizer>();

    /**
     * @param _monaco The Monarch runtime ({@link IMonarchApi}), injected so this
     * package depends on `monaco-editor` for types only.
     * @param _grammars Maps a language id to its Monarch language definition.
     */
    constructor(
        private readonly _monaco: IMonarchApi,
        private readonly _grammars: ReadonlyMap<string, unknown>,
    ) { }

    create(language: string, initialText: string): ISyntaxHighlighterDocument {
        return new MonacoHighlighterDocument(this._tokenizerFor(language), initialText);
    }

    dispose(): void {
        for (const t of this._tokenizers.values()) { t.dispose(); }
        this._tokenizers.clear();
    }

    private _tokenizerFor(language: string): MonarchTokenizer | undefined {
        const grammar = this._grammars.get(language);
        if (grammar === undefined) { return undefined; }
        let tokenizer = this._tokenizers.get(language);
        if (!tokenizer) {
            tokenizer = new this._monaco.MonarchTokenizer(_stubLanguageService, _stubThemeService, language, this._monaco.compile(language, grammar), _stubConfigurationService);
            this._tokenizers.set(language, tokenizer);
        }
        return tokenizer;
    }
}

interface LineData {
    readonly text: string;
    /** Tokens covering `text` exactly: `sum(token.length) === text.length`. */
    readonly tokens: readonly Token[];
    /** Monarch state after this line — the start state of the next line. */
    readonly endState: IMonarchTokenizerState;
}

class MonacoHighlighterDocument implements ISyntaxHighlighterDocument {
    private _text: string;
    private _lines: LineData[];
    /** Source offset of each line's first char; `length === _lines.length`. */
    private _lineStarts: number[];
    private _version = 1;
    private _disposed = false;

    private readonly _initialState: IMonarchTokenizerState | undefined;
    private readonly _snapshotObs: ISettableObservable<ISyntaxHighlightedSnapshot, LengthEdit>;

    constructor(
        private readonly _tokenizer: MonarchTokenizer | undefined,
        initialText: string,
    ) {
        this._initialState = _tokenizer?.getInitialState();
        this._text = initialText;
        this._lines = this._tokenizeFrom(0, [], this._initialState, initialText.split('\n'));
        this._lineStarts = this._computeLineStarts();
        this._snapshotObs = observableValue('syntaxSnapshot', new MonacoHighlightedSnapshot(this, this._version));
    }

    get snapshot() { return this._snapshotObs; }

    update(edit: StringEdit, tx: ITransaction): void {
        if (this._disposed) { throw new Error('document is disposed'); }
        if (edit.isEmpty) { return; }

        const oldTokens = _flatTokens(this._lines);
        const newText = edit.apply(this._text);
        const firstChangedOffset = edit.replacements[0].replaceRange.start;
        const firstChangedLine = this._lineIndexAt(firstChangedOffset);

        const reusedPrefix = this._lines.slice(0, firstChangedLine);
        const startState = firstChangedLine === 0
            ? this._initialState
            : this._lines[firstChangedLine - 1].endState;

        this._text = newText;
        this._lines = this._tokenizeFrom(firstChangedLine, reusedPrefix, startState, newText.split('\n'));
        this._lineStarts = this._computeLineStarts();
        this._version++;

        const lengthEdit = _minimalRecolor(oldTokens, _flatTokens(this._lines));
        this._snapshotObs.set(new MonacoHighlightedSnapshot(this, this._version), tx, lengthEdit);
    }

    dispose(): void {
        // The tokenizer is shared and owned by the highlighter, not this document.
        this._disposed = true;
    }

    /**
     * Tokenize `allLines[fromLine..]`, keeping `reusedPrefix` (already tokenized
     * lines `[0, fromLine)`) verbatim. `startState` is the state entering
     * `fromLine`.
     */
    private _tokenizeFrom(
        fromLine: number,
        reusedPrefix: readonly LineData[],
        startState: IMonarchTokenizerState | undefined,
        allLines: readonly string[],
    ): LineData[] {
        const lines: LineData[] = reusedPrefix.slice();
        let state = startState;
        for (let i = fromLine; i < allLines.length; i++) {
            const text = allLines[i];
            const hasEOL = i < allLines.length - 1;
            if (this._tokenizer && state) {
                const result = this._tokenizer.tokenize(text, hasEOL, state);
                lines.push({ text, tokens: _toTokens(result.tokens, text.length), endState: result.endState });
                state = result.endState;
            } else {
                lines.push({ text, tokens: text.length === 0 ? [] : [new Token(text.length, undefined)], endState: state! });
            }
        }
        return lines;
    }

    private _computeLineStarts(): number[] {
        const starts: number[] = [];
        let offset = 0;
        for (const line of this._lines) {
            starts.push(offset);
            offset += line.text.length + 1; // + newline
        }
        return starts;
    }

    private _lineIndexAt(offset: number): number {
        for (let i = this._lineStarts.length - 1; i >= 0; i--) {
            if (offset >= this._lineStarts[i]) { return i; }
        }
        return 0;
    }

    /** @internal Called by {@link MonacoHighlightedSnapshot}. */
    _getTokens(version: number, queryRange: OffsetRange): SnapshotTokens {
        if (version !== this._version) { throw new Error('stale snapshot'); }
        const docLen = this._text.length;
        const queryStart = Math.max(0, Math.min(queryRange.start, docLen));
        const queryEnd = Math.max(queryStart, Math.min(queryRange.endExclusive, docLen));

        const tokens: Token[] = [];
        let rangeStart = queryStart;
        let rangeEnd = queryStart;
        let started = false;
        let pos = 0;
        const consider = (length: number, className: string | undefined): void => {
            const tokenStart = pos;
            const tokenEnd = pos + length;
            pos = tokenEnd;
            if (length === 0) { return; }
            // Keep whole tokens that overlap the query (an empty query overlaps none).
            if (tokenStart < queryEnd && tokenEnd > queryStart) {
                if (!started) { rangeStart = tokenStart; started = true; }
                tokens.push(new Token(length, className));
                rangeEnd = tokenEnd;
            }
        };
        for (let i = 0; i < this._lines.length && pos < queryEnd; i++) {
            for (const t of this._lines[i].tokens) { consider(t.length, t.className); }
            if (i < this._lines.length - 1) { consider(1, undefined); } // newline char
        }
        return { range: new OffsetRange(rangeStart, started ? rangeEnd : queryStart), tokens };
    }
}

class MonacoHighlightedSnapshot implements ISyntaxHighlightedSnapshot {
    constructor(
        private readonly _doc: MonacoHighlighterDocument,
        private readonly _version: number,
    ) { }

    getTokens(queryRange: OffsetRange): SnapshotTokens {
        return this._doc._getTokens(this._version, queryRange);
    }
}

/** Monarch token type → CSS class. The empty type is an unstyled run. */
function _classNameOf(type: string): string | undefined {
    return type === '' ? undefined : type;
}

/** Convert Monarch's (offset, type) tokens into dense length-based tokens. */
function _toTokens(monarchTokens: readonly { readonly offset: number; readonly type: string }[], lineLength: number): Token[] {
    if (monarchTokens.length === 0) {
        return lineLength === 0 ? [] : [new Token(lineLength, undefined)];
    }
    const tokens: Token[] = [];
    for (let i = 0; i < monarchTokens.length; i++) {
        const startOffset = monarchTokens[i].offset;
        const endOffset = i + 1 < monarchTokens.length ? monarchTokens[i + 1].offset : lineLength;
        if (endOffset > startOffset) {
            tokens.push(new Token(endOffset - startOffset, _classNameOf(monarchTokens[i].type)));
        }
    }
    return tokens;
}

/**
 * The whole document's tokens as one dense, offset-free run — exactly the
 * sequence {@link MonacoHighlighterDocument._getTokens} would emit for the full
 * range, including the length-1 unstyled token for each inter-line newline.
 */
function _flatTokens(lines: readonly LineData[]): Token[] {
    const tokens: Token[] = [];
    for (let i = 0; i < lines.length; i++) {
        for (const t of lines[i].tokens) { tokens.push(t); }
        if (i < lines.length - 1) { tokens.push(new Token(1, undefined)); } // newline char
    }
    return tokens;
}

function _tokensEqual(a: Token, b: Token): boolean {
    return a.length === b.length && a.className === b.className;
}

function _sumLengths(tokens: readonly Token[]): number {
    let sum = 0;
    for (const t of tokens) { sum += t.length; }
    return sum;
}

/**
 * The minimal {@link LengthEdit} taking the old token run to the new one,
 * snapped to *token* boundaries: trim the run of identical leading tokens and
 * the run of identical trailing tokens; whatever lies between is the only
 * region whose tokenization actually changed.
 *
 * Snapping to whole tokens (rather than to per-character colours) is what makes
 * the edit faithful: if a token merely grows or merges at a boundary, the whole
 * affected token is reported, so {@link ISyntaxHighlightedSnapshot.getTokens}
 * over any range the edit leaves untouched is structurally unchanged.
 */
function _minimalRecolor(oldTokens: readonly Token[], newTokens: readonly Token[]): LengthEdit {
    const oldCount = oldTokens.length;
    const newCount = newTokens.length;

    let prefix = 0;
    let prefixChars = 0;
    while (prefix < oldCount && prefix < newCount && _tokensEqual(oldTokens[prefix], newTokens[prefix])) {
        prefixChars += oldTokens[prefix].length;
        prefix++;
    }

    let suffix = 0;
    let suffixChars = 0;
    while (suffix < oldCount - prefix && suffix < newCount - prefix
        && _tokensEqual(oldTokens[oldCount - 1 - suffix], newTokens[newCount - 1 - suffix])) {
        suffixChars += oldTokens[oldCount - 1 - suffix].length;
        suffix++;
    }

    const oldChars = _sumLengths(oldTokens);
    const newChars = _sumLengths(newTokens);
    const oldRange = new OffsetRange(prefixChars, oldChars - suffixChars);
    const newRangeLength = newChars - suffixChars - prefixChars;
    if (oldRange.isEmpty && newRangeLength === 0) { return LengthEdit.empty; }
    return LengthEdit.replace(oldRange, newRangeLength);
}

// --- Minimal headless stand-ins for the services MonarchTokenizer asks for. ---
// The classic tokenizer path touches none of these on the hot path (only
// embedded-language and encoded-token paths do), so empty stubs suffice.

const _stubLanguageService = {
    languageIdCodec: { encodeLanguageId: () => 0, decodeLanguageId: () => '' },
    isRegisteredLanguageId: () => false,
    getLanguageIdByLanguageName: () => null,
    getLanguageIdByMimeType: () => null,
    requestBasicLanguageFeatures: () => { },
};

const _stubThemeService = {
    getColorTheme: () => ({ tokenTheme: {} }),
};

const _stubConfigurationService = {
    getValue: () => 20000,
    onDidChangeConfiguration: () => ({ dispose() { } }),
};
