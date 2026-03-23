import { describe, expect, it, vi } from "vitest";

type Snippet = {
    languageId: string;
    prefix?: string;
    body: string[];
    isFileTemplate?: boolean;
    description?: string;
};

vi.mock("../utils/languages", () => ({
    getLineCommentSyntax: vi.fn().mockResolvedValue("//"),
    getExtensionFromLanguageId: vi.fn().mockReturnValue(".ts"),
}));

import {
    trimStringArray,
    isECMA,
    reverseMap,
    getGeneratedIdMappings,
    ECMA_LANGUAGES,
    DIRECTIVES,
    DIRECTIVE_PREFIX,
    SnippetParser,
    stringifySnippet,
    parseSnippet,
} from "./utility";

describe("snippetEditor/utility", () => {
    describe("trimStringArray", () => {
        it("should return empty array for empty input", () => {
            expect(trimStringArray([])).toEqual([]);
        });

        it("should return empty array when all elements are whitespace", () => {
            expect(trimStringArray(["", "  ", "\t"])).toEqual([]);
        });

        it("should trim leading whitespace", () => {
            expect(trimStringArray(["", "  ", "content"])).toEqual(["content"]);
        });

        it("should trim trailing whitespace", () => {
            expect(trimStringArray(["content", "  ", ""])).toEqual(["content"]);
        });

        it("should trim both leading and trailing whitespace", () => {
            expect(trimStringArray(["", "  ", "content", "  ", ""])).toEqual(["content"]);
        });

        it("should preserve content in the middle", () => {
            expect(trimStringArray(["", "line1", "line2", "line3", ""])).toEqual(["line1", "line2", "line3"]);
        });

        it("should handle single element array", () => {
            expect(trimStringArray(["content"])).toEqual(["content"]);
        });

        it("should handle whitespace-only single element", () => {
            expect(trimStringArray(["  "])).toEqual([]);
        });
    });

    describe("isECMA", () => {
        it("should return true for typescript", () => {
            expect(isECMA("typescript")).toBe(true);
        });

        it("should return true for typescriptreact", () => {
            expect(isECMA("typescriptreact")).toBe(true);
        });

        it("should return true for javascript", () => {
            expect(isECMA("javascript")).toBe(true);
        });

        it("should return true for javascriptreact", () => {
            expect(isECMA("javascriptreact")).toBe(true);
        });

        it("should return true for react", () => {
            expect(isECMA("react")).toBe(true);
        });

        it("should return true for node", () => {
            expect(isECMA("node")).toBe(true);
        });

        it("should return false for python", () => {
            expect(isECMA("python")).toBe(false);
        });

        it("should return false for java", () => {
            expect(isECMA("java")).toBe(false);
        });

        it("should return false for unknown language", () => {
            expect(isECMA("unknown")).toBe(false);
        });
    });

    describe("ECMA_LANGUAGES", () => {
        it("should contain expected languages", () => {
            expect(ECMA_LANGUAGES.has("typescript")).toBe(true);
            expect(ECMA_LANGUAGES.has("typescriptreact")).toBe(true);
            expect(ECMA_LANGUAGES.has("javascript")).toBe(true);
            expect(ECMA_LANGUAGES.has("javascriptreact")).toBe(true);
            expect(ECMA_LANGUAGES.has("react")).toBe(true);
            expect(ECMA_LANGUAGES.has("node")).toBe(true);
        });
    });

    describe("DIRECTIVES", () => {
        it("should have all expected directive keys", () => {
            expect(DIRECTIVES).toEqual({
                languageId: "languageId",
                prefix: "prefix",
                description: "description",
                isFileTemplate: "isFileTemplate",
            });
        });
    });

    describe("DIRECTIVE_PREFIX", () => {
        it("should be '@'", () => {
            expect(DIRECTIVE_PREFIX).toBe("@");
        });
    });

    describe("reverseMap", () => {
        it("should return empty object for empty input", () => {
            expect(reverseMap({})).toEqual({});
        });

        it("should reverse single key-value pair", () => {
            expect(reverseMap({ typescript: ["javascript"] })).toEqual({ javascript: ["typescript"] });
        });

        it("should reverse multiple values for single key", () => {
            expect(reverseMap({ typescript: ["javascript", "node"] })).toEqual({
                javascript: ["typescript"],
                node: ["typescript"],
            });
        });

        it("should handle multiple keys with same values", () => {
            expect(reverseMap({ typescript: ["node"], javascript: ["node"] })).toEqual({
                node: ["typescript", "javascript"],
            });
        });

        it("should trim whitespace from values", () => {
            expect(reverseMap({ typescript: ["  javascript  ", "node"] })).toEqual({
                javascript: ["typescript"],
                node: ["typescript"],
            });
        });

        it("should handle empty value arrays", () => {
            expect(reverseMap({ typescript: [] })).toEqual({});
        });

        it("should coerce values to strings", () => {
            expect(reverseMap({ typescript: [123, 456] })).toEqual({
                "123": ["typescript"],
                "456": ["typescript"],
            });
        });
    });

    describe("getGeneratedIdMappings", () => {
        it("should return empty object when no mappings configured", () => {
            const result = getGeneratedIdMappings();
            expect(result).toEqual({});
        });

        it("should return empty object with default config", () => {
            getGeneratedIdMappings();
        });
    });

    describe("SnippetParser.stringify", () => {
        it("should stringify a basic snippet", async () => {
            const snippet: Snippet = {
                languageId: "typescript",
                prefix: "test",
                body: ["console.log('hello');"],
                description: "A test snippet",
            };

            const result = await SnippetParser.stringify(snippet);

            expect(result).toContain("@languageId typescript");
            expect(result).toContain("@prefix test");
            expect(result).toContain("@description A test snippet");
            expect(result).toContain("@isFileTemplate ");
            expect(result).toContain("console.log('hello');");
        });

        it("should stringify snippet with undefined optional fields", async () => {
            const snippet: Snippet = {
                languageId: "typescript",
                body: ["content"],
            };

            const result = await SnippetParser.stringify(snippet);

            expect(result).toContain("@languageId typescript");
            expect(result).toContain("@prefix ");
            expect(result).toContain("@description ");
            expect(result).toContain("@isFileTemplate ");
        });

        it("should add eslint directives for ECMA languages", async () => {
            const snippet: Snippet = {
                languageId: "typescript",
                body: ["const x = 1;"],
            };

            const result = await SnippetParser.stringify(snippet);

            expect(result).toContain("@ts-nocheck");
            expect(result).toContain("prettier-ignore");
            expect(result).toContain("eslint-disable");
        });

        it("should not add eslint directives for non-ECMA languages", async () => {
            const snippet: Snippet = {
                languageId: "python",
                body: ["print('hello')"],
            };

            const result = await SnippetParser.stringify(snippet);

            expect(result).not.toContain("@ts-nocheck");
            expect(result).not.toContain("prettier-ignore");
            expect(result).not.toContain("eslint-disable");
        });

        it("should handle multiline body", async () => {
            const snippet: Snippet = {
                languageId: "typescript",
                body: ["const a = 1;", "const b = 2;", "return a + b;"],
            };

            const result = await SnippetParser.stringify(snippet);

            expect(result).toContain("const a = 1;");
            expect(result).toContain("const b = 2;");
            expect(result).toContain("return a + b;");
        });

        it("should stringify isFileTemplate as true", async () => {
            const snippet: Snippet = {
                languageId: "typescript",
                prefix: "template",
                isFileTemplate: true,
                body: ["// template content"],
            };

            const result = await SnippetParser.stringify(snippet);

            expect(result).toContain("@isFileTemplate true");
        });
    });

    describe("SnippetParser.parse", () => {
        it("should parse a basic snippet", async () => {
            const snippetText = [
                "// @languageId typescript",
                "// @prefix test",
                "// @description A test snippet",
                "// @isFileTemplate ",
                "//",
                "console.log('hello');",
            ].join("\n");

            const result = await SnippetParser.parse(snippetText);

            expect(result).toEqual({
                languageId: "typescript",
                prefix: "test",
                description: "A test snippet",
                isFileTemplate: undefined,
                body: ["console.log('hello');"],
            });
        });

        it("should return null when languageId directive is missing", async () => {
            const snippetText = [
                "// @prefix test",
                "// @description A test snippet",
                "// @isFileTemplate ",
                "console.log('hello');",
            ].join("\n");

            const result = await SnippetParser.parse(snippetText);

            expect(result).toBeNull();
        });

        it("should return null when prefix directive is missing", async () => {
            const snippetText = [
                "// @languageId typescript",
                "// @description A test snippet",
                "// @isFileTemplate ",
                "console.log('hello');",
            ].join("\n");

            const result = await SnippetParser.parse(snippetText);

            expect(result).toBeNull();
        });

        it("should parse snippet with multiline body", async () => {
            const snippetText = [
                "// @languageId typescript",
                "// @prefix multi",
                "// @description Multiline snippet",
                "// @isFileTemplate ",
                "//",
                "const a = 1;",
                "const b = 2;",
                "return a + b;",
            ].join("\n");

            const result = await SnippetParser.parse(snippetText);

            expect(result?.body).toEqual(["const a = 1;", "const b = 2;", "return a + b;"]);
        });

        it("should parse isFileTemplate as true", async () => {
            const snippetText = [
                "// @languageId typescript",
                "// @prefix template",
                "// @description A template",
                "// @isFileTemplate true",
                "//",
                "// template content",
            ].join("\n");

            const result = await SnippetParser.parse(snippetText);

            expect(result?.isFileTemplate).toBe(true);
        });

        it("should parse isFileTemplate as false when empty", async () => {
            const snippetText = [
                "// @languageId typescript",
                "// @prefix test",
                "// @description ",
                "// @isFileTemplate ",
                "content",
            ].join("\n");

            const result = await SnippetParser.parse(snippetText);

            expect(result?.isFileTemplate).toBeUndefined();
        });

        it("should handle description with special characters", async () => {
            const snippetText = [
                "// @languageId typescript",
                "// @prefix test",
                "// @description Test with 'quotes' and :colons:",
                "// @isFileTemplate ",
                "content",
            ].join("\n");

            const result = await SnippetParser.parse(snippetText);

            expect(result?.description).toBe("Test with 'quotes' and :colons:");
        });

        it("should handle extra whitespace in directives", async () => {
            const snippetText = [
                "// @languageId   typescript  ",
                "// @prefix   test  ",
                "// @description  ",
                "// @isFileTemplate  ",
                "content",
            ].join("\n");

            const result = await SnippetParser.parse(snippetText);

            expect(result?.languageId).toBe("typescript");
            expect(result?.prefix).toBe("test");
        });
    });

    describe("stringifySnippet and parseSnippet", () => {
        it("should round-trip a snippet", async () => {
            const original: Snippet = {
                languageId: "typescript",
                prefix: "roundtrip",
                description: "Testing round-trip",
                isFileTemplate: true,
                body: ["const x = 1;", "console.log(x);"],
            };

            const stringified = await stringifySnippet(original);
            const parsed = await parseSnippet(stringified);

            expect(parsed).toEqual(original);
        });

        it("should round-trip snippet with minimal fields", async () => {
            const original: Snippet = {
                languageId: "python",
                prefix: "hello",
                body: ["print('hello')"],
            };

            const stringified = await stringifySnippet(original);
            const parsed = await parseSnippet(stringified);

            expect(parsed?.languageId).toBe(original.languageId);
            expect(parsed?.body).toEqual(original.body);
            expect(parsed?.prefix).toBe(original.prefix);
            expect(parsed?.description).toBeUndefined();
            expect(parsed?.isFileTemplate).toBeUndefined();
        });
    });
});
