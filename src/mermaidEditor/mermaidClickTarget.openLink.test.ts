import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    openExternal,
    showErrorMessage,
    showTextDocument,
    openTextDocument,
    fsStat,
    executeCommand,
} = vi.hoisted(() => ({
    openExternal: vi.fn().mockResolvedValue(true),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
    showTextDocument: vi.fn().mockResolvedValue(undefined),
    openTextDocument: vi.fn().mockResolvedValue({ uri: { fsPath: "" } }),
    fsStat: vi.fn(),
    executeCommand: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("vscode", () => ({
    env: { openExternal },
    commands: { executeCommand },
    Uri: {
        file: (fsPath: string) => ({ scheme: "file", fsPath, path: fsPath, toString: () => fsPath }),
        parse: (value: string) => ({ scheme: "https", fsPath: value, toString: () => value }),
    },
    window: { showErrorMessage, showTextDocument },
    workspace: {
        fs: { stat: fsStat },
        openTextDocument,
    },
    ViewColumn: { Beside: 2, Active: 1 },
    Position: class {
        constructor(
            public readonly line: number,
            public readonly character: number
        ) {}
    },
    Range: class {
        constructor(
            public readonly start: { line: number; character: number },
            public readonly end: { line: number; character: number }
        ) {}
    },
}));

import { readFileSync } from "node:fs";
import { Uri, ViewColumn } from "vscode";
import { handleMermaidOpenLink, parseMermaidClickTarget } from "./mermaidClickTarget";
import { mermaidDocsFixturePath } from "./mermaidDocsFixture";
import { parseMermaidClickHrefLines } from "./parseMermaidClickLines";

describe("mermaidEditor/mermaidClickTarget openLink", () => {
    beforeEach(() => {
        openExternal.mockClear();
        showErrorMessage.mockClear();
        showTextDocument.mockClear();
        openTextDocument.mockClear();
        fsStat.mockClear();
        executeCommand.mockClear();
    });

    it("opens external https links without touching the workspace", async () => {
        await handleMermaidOpenLink(Uri.file("/diagram.mmd"), {
            href: "https://mermaid.js.org/",
        });

        expect(openExternal).toHaveBeenCalledOnce();
        expect(openTextDocument).not.toHaveBeenCalled();
    });

    it("opens mailto links externally", async () => {
        await handleMermaidOpenLink(Uri.file("/diagram.mmd"), {
            href: "mailto:team@example.com",
        });

        expect(openExternal).toHaveBeenCalledOnce();
    });

    it("opens workspace targets from fixture click lines", async () => {
        const dir = mkdtempSync(join(tmpdir(), "mermaid-open-"));
        const objDir = join(dir, "obj");
        mkdirSync(objDir);
        const gblPath = join(dir, "test.gbl");
        const mmdPath = join(objDir, "graph.mmd");
        writeFileSync(gblPath, "func Main\n");
        writeFileSync(mmdPath, readFileSync(mermaidDocsFixturePath("call_graph.mmd"), "utf8"));

        fsStat.mockResolvedValue({ type: 1 });
        const docUri = { fsPath: gblPath };
        openTextDocument.mockResolvedValue({ uri: docUri });

        const mermaidUri = Uri.file(mmdPath);
        const mainClick = parseMermaidClickHrefLines(readFileSync(mmdPath, "utf8")).find((c) => c.nodeId === "Main");
        expect(mainClick).toBeDefined();

        const target = parseMermaidClickTarget(mainClick!.tooltip, mainClick!.href);
        expect(target).toEqual({ relativePath: "../test.gbl", line: 1, column: 1 });

        await handleMermaidOpenLink(mermaidUri, {
            href: mainClick!.href,
            tooltip: mainClick!.tooltip,
        });

        expect(openTextDocument).toHaveBeenCalledWith(expect.objectContaining({ fsPath: gblPath }));
        expect(showTextDocument).toHaveBeenCalledWith(
            { uri: docUri },
            expect.objectContaining({
                selection: expect.objectContaining({
                    start: expect.objectContaining({ line: 0, character: 0 }),
                }),
            })
        );
        expect(openExternal).not.toHaveBeenCalled();
    });

    it("shows an error when the target file is missing", async () => {
        fsStat.mockRejectedValue(new Error("ENOENT"));

        await handleMermaidOpenLink(Uri.file("/missing/graph.mmd"), {
            href: "../nope.gbl#L1",
            tooltip: "../nope.gbl:1:1",
        });

        expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("../nope.gbl"));
        expect(showTextDocument).not.toHaveBeenCalled();
    });

    it("opens relative .mmd files with the mermaid preview editor", async () => {
        const dir = mkdtempSync(join(tmpdir(), "mermaid-mmd-"));
        const mmdPath = join(dir, "target.mmd");
        const sourcePath = join(dir, "graph.mmd");
        writeFileSync(mmdPath, "flowchart TD\n  A[A]\n");
        writeFileSync(sourcePath, "");

        fsStat.mockResolvedValue({ type: 1 });
        openTextDocument.mockResolvedValue({ uri: { fsPath: mmdPath } });

        await handleMermaidOpenLink(Uri.file(sourcePath), {
            href: "target.mmd",
            tooltip: "target.mmd:1:1",
        });

        expect(executeCommand).toHaveBeenCalledWith(
            "vscode.openWith",
            expect.objectContaining({ fsPath: mmdPath }),
            "ib-utilities.mermaidPreview",
            expect.objectContaining({ preview: false })
        );
        expect(showTextDocument).not.toHaveBeenCalled();
    });

    it("opens co-located test.txt at line and column from GBL click strings", async () => {
        const dir = mkdtempSync(join(tmpdir(), "mermaid-txt-"));
        const txtPath = join(dir, "test.txt");
        const mmdPath = join(dir, "graph.mmd");
        writeFileSync(txtPath, "a\nb\nc\n");
        writeFileSync(mmdPath, readFileSync(mermaidDocsFixturePath("call_graph.mmd"), "utf8"));

        fsStat.mockResolvedValue({ type: 1 });
        openTextDocument.mockResolvedValue({ uri: { fsPath: txtPath } });

        const otherClick = parseMermaidClickHrefLines(readFileSync(mmdPath, "utf8")).find(
            (c) => c.nodeId === "Other"
        );
        expect(otherClick).toBeDefined();

        await handleMermaidOpenLink(Uri.file(mmdPath), {
            href: otherClick!.href,
            tooltip: otherClick!.tooltip,
        });

        expect(showTextDocument).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                selection: expect.objectContaining({
                    start: expect.objectContaining({ line: 2, character: 1 }),
                }),
            })
        );
    });

    it("opens beside when requested for non-mermaid files", async () => {
        const dir = mkdtempSync(join(tmpdir(), "mermaid-beside-"));
        const filePath = join(dir, "target.gbl");
        writeFileSync(filePath, "");
        writeFileSync(join(dir, "graph.mmd"), "");

        fsStat.mockResolvedValue({ type: 1 });
        openTextDocument.mockResolvedValue({ uri: { fsPath: filePath } });

        await handleMermaidOpenLink(Uri.file(join(dir, "graph.mmd")), {
            href: "target.gbl#L3",
            openBeside: true,
        });

        expect(showTextDocument).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                viewColumn: ViewColumn.Beside,
                preview: false,
            })
        );
    });
});
