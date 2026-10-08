import { describe, expect, it } from "vitest";
import { Uri } from "vscode";
import { parseGitDocumentUri } from "./gitDocument";

const filePath = "/home/user/project/src/a.ts";

function gitUri(ref: string): Uri {
    return Uri.from({
        scheme: "git",
        path: filePath,
        query: JSON.stringify({ path: filePath, ref }),
    });
}

describe("parseGitDocumentUri", () => {
    it("parses git scheme URIs", () => {
        const parsed = parseGitDocumentUri(gitUri("HEAD"));
        expect(parsed).toEqual({ filePath, ref: "HEAD" });
    });

    it("returns undefined for non-git URIs", () => {
        expect(parseGitDocumentUri(Uri.file(filePath))).toBeUndefined();
    });
});
