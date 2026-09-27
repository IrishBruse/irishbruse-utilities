import { MonacoSyntaxHighlighter, type IMonarchApi } from './monacoSyntaxHighlighter.js';

/** The Monarch language definitions the default highlighter wires up. */
export interface IDefaultMonarchGrammars {
    typescript: unknown;
    javascript: unknown;
    css: unknown;
    html: unknown;
    python: unknown;
    rust: unknown;
    shell: unknown;
    yaml: unknown;
}

/**
 * A {@link MonacoSyntaxHighlighter} preloaded with a handful of common Monarch
 * grammars (plus the usual short aliases). Unknown languages fall back to an
 * unstyled single token, so the highlighter is always safe to call.
 *
 * The Monarch runtime and grammar definitions are injected so this package
 * depends on `monaco-editor` for types only.
 */
export function createDefaultMonacoSyntaxHighlighter(
    monaco: IMonarchApi,
    grammars: IDefaultMonarchGrammars,
): MonacoSyntaxHighlighter {
    const grammarMap = new Map<string, unknown>([
        ['typescript', grammars.typescript],
        ['ts', grammars.typescript],
        ['javascript', grammars.javascript],
        ['js', grammars.javascript],
        ['css', grammars.css],
        ['html', grammars.html],
        ['python', grammars.python],
        ['py', grammars.python],
        ['rust', grammars.rust],
        ['rs', grammars.rust],
        ['shell', grammars.shell],
        ['sh', grammars.shell],
        ['bash', grammars.shell],
        ['yaml', grammars.yaml],
        ['yml', grammars.yaml],
    ]);
    return new MonacoSyntaxHighlighter(monaco, grammarMap);
}
