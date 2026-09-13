import { describe, expect, it } from "vitest";
import { hasDiskEditorConflict } from "./hasDiskEditorConflict";

describe("hasDiskEditorConflict", () => {
    it("is false when the editor is dirty but disk still matches the baseline", () => {
        expect(hasDiskEditorConflict("editor dirty", "saved on disk", "saved on disk")).toBe(false);
    });

    it("is true when disk changed from the baseline and differs from the editor", () => {
        expect(hasDiskEditorConflict("editor dirty", "saved on disk", "agent write")).toBe(true);
    });

    it("is false when disk changed but the editor already matches disk", () => {
        expect(hasDiskEditorConflict("agent write", "saved on disk", "agent write")).toBe(false);
    });

    it("is false after revert when editor, baseline, and disk match", () => {
        expect(hasDiskEditorConflict("from disk", "from disk", "from disk")).toBe(false);
    });

    it("is false when the only difference is EOL", () => {
        expect(hasDiskEditorConflict("a\nb\n", "a\r\nb\r\n", "a\r\nb\r\n")).toBe(false);
        expect(hasDiskEditorConflict("a\nb", "a\nb", "a\r\nb")).toBe(false);
    });
});
