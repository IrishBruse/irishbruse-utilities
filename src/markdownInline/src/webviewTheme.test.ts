import { describe, expect, it } from "vitest";
import { parseStyleAttributeVariables } from "./webviewTheme";

describe("parseStyleAttributeVariables", () => {
    it("reads vscode custom properties from an inline style attribute", () => {
        const vars = parseStyleAttributeVariables(
            "--vscode-editor-background: #282c34; --vscode-input-background: #252931;",
        );
        expect(vars.get("--vscode-editor-background")).toBe("#282c34");
        expect(vars.get("--vscode-input-background")).toBe("#252931");
    });
});
