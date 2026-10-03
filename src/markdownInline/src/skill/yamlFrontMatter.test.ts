import { describe, expect, it } from "vitest";
import { hasYamlFrontMatter, readFrontMatter, readYamlFrontMatter } from "./yamlFrontMatter";

describe("readYamlFrontMatter", () => {
    it("returns undefined when the text does not open a front matter fence", () => {
        expect(readYamlFrontMatter("hello")).toBeUndefined();
        expect(readYamlFrontMatter("---")).toBeUndefined();
        expect(readYamlFrontMatter("---\r")).toBeUndefined();
        expect(readYamlFrontMatter("--- \nname: a\n---\n")).toBeUndefined();
        expect(readYamlFrontMatter("----\nname: a\n---\n")).toBeUndefined();
        expect(readYamlFrontMatter("---\nname: a\n")).toBeUndefined();
        expect(hasYamlFrontMatter("hello")).toBe(false);
        expect(hasYamlFrontMatter("---\nname: a\n")).toBe(false);
        expect(readFrontMatter("hello")).toBeUndefined();
    });

    it("reads yaml between fences, including CRLF and a closing fence at EOF", () => {
        const text = "---\nname: a\n---\nbody";
        const span = {
            yamlStart: 4,
            yamlEnd: 12,
            end: 16,
            yaml: "name: a\n",
        };
        expect(readYamlFrontMatter(text)).toEqual(span);
        expect(readFrontMatter(text)).toEqual(span);
        expect(hasYamlFrontMatter(text)).toBe(true);

        expect(readYamlFrontMatter("---\n---\n")).toEqual({
            yamlStart: 4,
            yamlEnd: 4,
            end: 8,
            yaml: "",
        });
        expect(readYamlFrontMatter("---\nname: a\n---")).toEqual({
            yamlStart: 4,
            yamlEnd: 12,
            end: 15,
            yaml: "name: a\n",
        });
        expect(readYamlFrontMatter("---\r\nname: a\r\n---\r\nbody")).toMatchObject({
            yaml: "name: a\r\n",
        });
    });
});
