import { describe, expect, it } from "vitest";
import { Uri } from "vscode";
import { Status } from "./gitApi";
import type { Change } from "./gitApi";
import { toMultiFileDiffEditorUris } from "./gitUri";

const filePath = "/repo/src/a.ts";
const fileUri = Uri.file(filePath);

function change(status: Status, uri = fileUri, originalUri = fileUri): Change {
    return {
        uri,
        originalUri,
        renameUri: undefined,
        status,
    };
}

describe("toMultiFileDiffEditorUris", () => {
    it("uses working tree file URI for modified files", () => {
        const uris = toMultiFileDiffEditorUris(change(Status.MODIFIED), "abc123", "HEAD");
        expect(uris.modifiedUri).toEqual(fileUri);
        expect(uris.originalUri?.scheme).toBe("git");
    });

    it("uses working tree file URI for added files", () => {
        const uris = toMultiFileDiffEditorUris(change(Status.INDEX_ADDED), "abc123", "HEAD");
        expect(uris.modifiedUri).toEqual(fileUri);
        expect(uris.originalUri).toBeUndefined();
    });

    it("omits modified URI for deleted files", () => {
        const uris = toMultiFileDiffEditorUris(change(Status.DELETED), "abc123", "HEAD");
        expect(uris.modifiedUri).toBeUndefined();
        expect(uris.originalUri?.scheme).toBe("git");
    });

    it("uses git URI for renamed originals and working tree for modified", () => {
        const originalUri = Uri.file("/repo/src/old.ts");
        const uris = toMultiFileDiffEditorUris(
            change(Status.INDEX_RENAMED, fileUri, originalUri),
            "abc123",
            "HEAD"
        );
        expect(uris.modifiedUri).toEqual(fileUri);
        expect(uris.originalUri?.scheme).toBe("git");
    });
});
