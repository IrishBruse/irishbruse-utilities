import { describe, expect, it } from "vitest";
import { paintYamlFrontMatter, skillMarkdownLanguageId } from "./skillYaml";

const source = `---
name: markdown-skill-fixture
description: >-
  Manual fixture
disable-model-invocation: true
license: MIT
---
`;

function text(className: string): string {
    return paintYamlFrontMatter(source, 0, source.length)
        .filter((paint) => paint.className === className)
        .map((paint) => source.slice(paint.start, paint.end))
        .join("|");
}

describe("paintYamlFrontMatter", () => {
    it("colors keys, strings, booleans, and fences", () => {
        expect(text("inline-md-yaml-key")).toBe("name|description|disable-model-invocation|license");
        expect(text("inline-md-yaml-string")).toContain("markdown-skill-fixture");
        expect(text("inline-md-yaml-string")).toContain("Manual fixture");
        expect(text("inline-md-yaml-boolean")).toBe("true");
        expect(text("inline-md-yaml-operator")).toContain("---");
        expect(text("inline-md-yaml-operator")).toContain(">-");
        expect(skillMarkdownLanguageId).toBe("skill-markdown");
    });

    it("colors numbers, comments, document ends, and lines that are not keys", () => {
        const sample = [
            "---",
            "# heading",
            "name: alpha # note",
            "count: -1.5e2",
            "ratio: .5",
            "flag: false",
            "empty:",
            "name: # only",
            "...",
            "plain",
            "- item",
            "   ",
            "",
        ].join("\n");
        const painted = (className: string) => paintYamlFrontMatter(sample, 0, sample.length)
            .filter((paint) => paint.className === className)
            .map((paint) => sample.slice(paint.start, paint.end))
            .join("|");
        expect(painted("inline-md-yaml-number")).toContain("-1.5e2");
        expect(painted("inline-md-yaml-number")).toContain(".5");
        expect(painted("inline-md-yaml-boolean")).toContain("false");
        expect(painted("inline-md-yaml-comment")).toContain("# heading");
        expect(painted("inline-md-yaml-comment")).toContain("# note");
        expect(painted("inline-md-yaml-comment")).toContain("# only");
        expect(painted("inline-md-yaml-operator")).toContain("...");
        expect(painted("inline-md-yaml-string")).not.toContain("# only");
    });

    it("colors block scalars, carriage returns, and a range that ends before a newline", () => {
        const block = "body: |\n  one\n\n  two\nname: after\n";
        const blockText = paintYamlFrontMatter(block, 0, block.length)
            .filter((paint) => paint.className === "inline-md-yaml-string")
            .map((paint) => block.slice(paint.start, paint.end))
            .join("|");
        expect(blockText).toContain("one");
        expect(blockText).toContain("two");

        const crlf = "name: alpha\r\ncount: 3\r\n";
        expect(paintYamlFrontMatter(crlf, 0, crlf.length).some((paint) => crlf.slice(paint.start, paint.end) === "3")).toBe(true);

        expect(paintYamlFrontMatter("name: alpha", 0, "name: alpha".length).map((paint) => paint.className)).toContain("inline-md-yaml-key");
        expect(paintYamlFrontMatter("body: |\n  line", 0, "body: |\n  line".length).map((paint) => paint.className)).toContain("inline-md-yaml-string");

        const cut = "name: alpha\nname: beta\n";
        expect(paintYamlFrontMatter(cut, 0, "name: alpha".length).map((paint) => cut.slice(paint.start, paint.end))).toContain("name");
        expect(paintYamlFrontMatter(cut, 4, 4)).toEqual([]);
    });

    it("covers defensive regex and comment fallbacks", () => {
        const originalExec = RegExp.prototype.exec;
        const originalIndexOf = String.prototype.indexOf;
        try {
            String.prototype.indexOf = function (this: string, search: string, position?: number) {
                if (search === "#") {
                    return -1;
                }
                return originalIndexOf.call(this, search, position);
            };
            paintYamlFrontMatter("name: value # note\n", 0, "name: value # note\n".length);

            RegExp.prototype.exec = function (this: RegExp, string: string) {
                if (this.source === "^ *") {
                    return null;
                }
                return originalExec.call(this, string);
            } as typeof RegExp.prototype.exec;
            paintYamlFrontMatter("body: |\n  line\n", 0, "body: |\n  line\n".length);

            RegExp.prototype.exec = function (this: RegExp, string: string) {
                const match = originalExec.call(this, string);
                if (match && this.source.includes("[^:#")) {
                    for (let group = 1; group <= 6; group++) {
                        delete match[group];
                    }
                }
                return match;
            } as typeof RegExp.prototype.exec;
            expect(paintYamlFrontMatter("name: value\n", 0, "name: value\n".length).length).toBeGreaterThan(0);
        } finally {
            RegExp.prototype.exec = originalExec;
            String.prototype.indexOf = originalIndexOf;
        }
    });
});
