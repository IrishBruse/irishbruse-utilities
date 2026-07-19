import { describe, expect, it } from "vitest";
import { Uri } from "vscode";
import { getCodiconUri } from "./getCodiconUri";

describe("getCodiconUri", () => {
    it("returns light and dark extension URIs for a codicon svg", () => {
        const context = {
            extensionUri: Uri.file("/ext"),
        } as never;

        expect(getCodiconUri(context, "git-pull-request-create")).toEqual({
            light: {
                scheme: "file",
                fsPath: "/ext/media/codicons/light/git-pull-request-create.svg",
                path: "/ext/media/codicons/light/git-pull-request-create.svg",
                query: "",
            },
            dark: {
                scheme: "file",
                fsPath: "/ext/media/codicons/dark/git-pull-request-create.svg",
                path: "/ext/media/codicons/dark/git-pull-request-create.svg",
                query: "",
            },
        });
    });

    it("returns undefined for empty icon names", () => {
        const context = {
            extensionUri: Uri.file("/ext"),
        } as never;

        expect(getCodiconUri(context, "")).toBeUndefined();
    });
});
