import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const decorationsPath = join(dirname(fileURLToPath(import.meta.url)), "decorations.ts");

describe("task content widget", () => {
    it("stays positioned inside the editor when the column is centered", () => {
        const source = readFileSync(decorationsPath, "utf8");
        const taskWidget = source.slice(source.indexOf("class TaskWidget"));
        expect(taskWidget).toContain("readonly allowEditorOverflow = false");
    });
});
