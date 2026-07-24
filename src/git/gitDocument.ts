import path from "path";
import { Uri } from "vscode";

export type ParsedGitDocument = {
    filePath: string;
    ref: string;
};

export function parseGitDocumentUri(uri: Uri): ParsedGitDocument | undefined {
    if (uri.scheme !== "git") {
        return undefined;
    }
    try {
        const params = JSON.parse(uri.query) as { path?: string; ref?: string };
        if (!params.path) {
            return undefined;
        }
        return {
            filePath: path.normalize(params.path),
            ref: params.ref ?? "",
        };
    } catch {
        return undefined;
    }
}
