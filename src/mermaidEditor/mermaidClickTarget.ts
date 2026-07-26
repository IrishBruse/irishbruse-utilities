import { existsSync } from "node:fs";
import * as path from "path";
import { commands, Position, Range, Uri, ViewColumn, env, window, workspace } from "vscode";

const MERMAID_PREVIEW_VIEW_TYPE = "ib-utilities.mermaidPreview";

export interface MermaidClickTarget {
    relativePath: string;
    line: number;
    column: number;
}

export interface MermaidOpenLinkRequest {
    href?: string;
    tooltip?: string;
    openBeside?: boolean;
}

const PATH_LINE_COLUMN_RE = /^(.+):(\d+):(\d+)$/;
const PATH_LINE_ONLY_RE = /^(.+):(\d+)$/;
/** GitHub-style line anchor: `#L12` */
const HREF_GITHUB_LINE_RE = /#L(\d+)\b/i;
/** VS Code URI fragment: `#L12,5` (see `text/uri-list` in VS Code API docs) */
const HREF_VSCODE_FRAGMENT_RE = /#L(\d+),(\d+)\b/i;
const EXTERNAL_HREF_RE = /^(https?:|mailto:)/i;

/** Strip `./` so `test.txt` and `./test.txt` resolve the same beside the diagram. */
export function normalizeGblRelativePath(relativePath: string): string {
    const trimmed = relativePath.trim();
    if (!trimmed) {
        return trimmed;
    }
    return trimmed.replace(/^\.\//, "");
}

function parseGblLocationString(value: string): MermaidClickTarget | undefined {
    const trimmed = value.trim();
    if (!trimmed || isExternalMermaidHref(trimmed)) {
        return undefined;
    }

    const lineColumn = PATH_LINE_COLUMN_RE.exec(trimmed);
    if (lineColumn) {
        return {
            relativePath: normalizeGblRelativePath(lineColumn[1]),
            line: parsePositiveInt(lineColumn[2], 1),
            column: parsePositiveInt(lineColumn[3], 1),
        };
    }

    const lineOnly = PATH_LINE_ONLY_RE.exec(trimmed);
    if (lineOnly) {
        return {
            relativePath: normalizeGblRelativePath(lineOnly[1]),
            line: parsePositiveInt(lineOnly[2], 1),
            column: 1,
        };
    }

    return undefined;
}

function parsePathLineColumnLocation(value: string): MermaidClickTarget | undefined {
    return parseGblLocationString(value);
}

function parseHrefWorkspaceLocation(href: string): MermaidClickTarget | undefined {
    const trimmedHref = href.trim();
    if (!trimmedHref) {
        return undefined;
    }

    const hashIndex = trimmedHref.indexOf("#");
    const pathPart = (hashIndex === -1 ? trimmedHref : trimmedHref.slice(0, hashIndex)).trim();
    const fragment = hashIndex === -1 ? "" : trimmedHref.slice(hashIndex);

    if (fragment) {
        const vscodeMatch = HREF_VSCODE_FRAGMENT_RE.exec(fragment);
        if (vscodeMatch && pathPart) {
            return {
                relativePath: normalizeGblRelativePath(pathPart),
                line: parsePositiveInt(vscodeMatch[1], 1),
                column: parsePositiveInt(vscodeMatch[2], 1),
            };
        }

        const githubMatch = HREF_GITHUB_LINE_RE.exec(fragment);
        if (githubMatch && pathPart) {
            return {
                relativePath: normalizeGblRelativePath(pathPart),
                line: parsePositiveInt(githubMatch[1], 1),
                column: 1,
            };
        }
    }

    const pathSuffix = parsePathLineColumnLocation(pathPart);
    if (pathSuffix) {
        return pathSuffix;
    }

    if (!pathPart) {
        return undefined;
    }

    return {
        relativePath: normalizeGblRelativePath(pathPart),
        line: 1,
        column: 1,
    };
}

/**
 * Parses GBL call-graph Mermaid click targets.
 *
 * Preferred (GBL tooltip): `../file.gbl:12:1` — path with `:line:column` suffix.
 * VS Code URI style (href fragment): `../file.gbl#L12,5` — `#L` + line + `,` + column.
 * GitHub/web (href fragment): `../file.gbl#L12` — line only, column defaults to 1.
 */
export function parseMermaidClickTarget(
    tooltip: string | undefined,
    href: string | undefined
): MermaidClickTarget | undefined {
    const trimmedTooltip = tooltip?.trim();
    if (trimmedTooltip) {
        const fromTooltip = parsePathLineColumnLocation(trimmedTooltip);
        if (fromTooltip) {
            return fromTooltip;
        }
    }

    const trimmedHref = href?.trim();
    if (!trimmedHref || isExternalMermaidHref(trimmedHref)) {
        return undefined;
    }

    return parseHrefWorkspaceLocation(trimmedHref);
}

export function isExternalMermaidHref(href: string): boolean {
    return EXTERNAL_HREF_RE.test(href.trim());
}

export function isMermaidFilePath(filePath: string): boolean {
    return /\.(mmd|mermaid)$/i.test(filePath);
}

function parsePositiveInt(value: string, fallback: number): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return fallback;
    }
    return parsed;
}

/** GBL call-graph location string: `relative/path.gbl:line:column` (1-based). */
export function formatGblPathLocation(relativePath: string, line: number, column: number): string {
    return `${relativePath}:${line}:${column}`;
}

/**
 * Normalizes click pairs for opening: `href` is the file path only (Mermaid-safe),
 * `tooltip` is the canonical GBL `path:line:column` location string.
 */
export function normalizeGblClickPair(href: string, tooltip?: string): { href: string; tooltip: string } {
    const trimmedHref = href.trim();
    const trimmedTooltip = tooltip?.trim() ?? "";

    const resolved =
        (trimmedTooltip ? parseGblLocationString(trimmedTooltip) : undefined) ??
        (trimmedHref ? parseGblLocationString(trimmedHref) : undefined) ??
        (trimmedHref ? parseHrefWorkspaceLocation(trimmedHref) : undefined);

    if (resolved) {
        const canonical = formatGblPathLocation(
            resolved.relativePath,
            resolved.line,
            resolved.column
        );
        return { href: resolved.relativePath, tooltip: canonical };
    }

    return { href: trimmedHref, tooltip: trimmedTooltip || trimmedHref };
}

export function resolveMermaidClickTargetPath(mermaidDocumentUri: Uri, target: MermaidClickTarget): string {
    const mermaidDir = path.dirname(mermaidDocumentUri.fsPath);
    const relativePath = normalizeGblRelativePath(target.relativePath);
    const resolved = path.resolve(mermaidDir, relativePath);
    if (existsSync(resolved)) {
        return resolved;
    }
    const basenameFallback = path.join(mermaidDir, path.basename(relativePath));
    if (existsSync(basenameFallback)) {
        return basenameFallback;
    }
    return resolved;
}

export async function handleMermaidOpenLink(
    mermaidDocumentUri: Uri,
    request: MermaidOpenLinkRequest
): Promise<void> {
    const href = typeof request.href === "string" ? request.href.trim() : "";
    const tooltip = typeof request.tooltip === "string" ? request.tooltip : undefined;
    const openBeside = request.openBeside === true;

    if (href && isExternalMermaidHref(href)) {
        await env.openExternal(Uri.parse(href));
        return;
    }

    const normalized = normalizeGblClickPair(href, tooltip);
    const target = parseMermaidClickTarget(normalized.tooltip, normalized.href);
    if (!target) {
        return;
    }

    await openMermaidClickTarget(mermaidDocumentUri, target, { openBeside });
}

export async function openMermaidClickTarget(
    mermaidDocumentUri: Uri,
    target: MermaidClickTarget,
    options: { openBeside?: boolean } = {}
): Promise<void> {
    const absolutePath = resolveMermaidClickTargetPath(mermaidDocumentUri, target);
    const docUri = Uri.file(absolutePath);

    try {
        await workspace.fs.stat(docUri);
    } catch {
        void window.showErrorMessage(`Mermaid link target not found: ${target.relativePath}`);
        return;
    }

    const doc = await workspace.openTextDocument(docUri);
    const position = new Position(target.line - 1, target.column - 1);
    const selection = new Range(position, position);

    if (isMermaidFilePath(absolutePath)) {
        await commands.executeCommand("vscode.openWith", docUri, MERMAID_PREVIEW_VIEW_TYPE, {
            viewColumn: options.openBeside ? ViewColumn.Beside : ViewColumn.Active,
            preview: false,
        });
        return;
    }

    if (options.openBeside) {
        await window.showTextDocument(doc, {
            viewColumn: ViewColumn.Beside,
            selection,
            preview: false,
        });
        return;
    }

    await window.showTextDocument(doc, { selection });
}
