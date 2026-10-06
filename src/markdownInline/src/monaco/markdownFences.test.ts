import { describe, expect, it } from "vitest";
import { language as markdownLanguage } from "monaco-editor/languages/definitions/markdown/markdown.js";
import { markdownFenceBody, markdownFenceLanguageId, markdownWithFenceColors } from "./markdownFences";

describe("markdownWithFenceColors", () => {
    it("separates the backticks from the language name", () => {
        const language = markdownWithFenceColors(markdownLanguage);
        const open = language.tokenizer.root?.find((rule) => Array.isArray(rule) && rule[0] instanceof RegExp && rule[0].source.includes("`{3,}") && rule[0].source.includes("(?:\\w"));
        expect(Array.isArray(open)).toBe(true);
        if (!Array.isArray(open)) {
            return;
        }
        const action = open[1];
        expect(Array.isArray(action)).toBe(true);
        if (!Array.isArray(action)) {
            return;
        }
        expect(action[0]).toBe("punctuation");
        expect(action[1]).toMatchObject({ token: "type", nextEmbedded: "$2" });
    });

    it("embeds a markdown fence as literal lines", () => {
        const language = markdownWithFenceColors(markdownLanguage);
        const open = language.tokenizer.root?.find((rule) => Array.isArray(rule) && rule[0] instanceof RegExp && rule[0].source.includes("(markdown)"));
        expect(Array.isArray(open)).toBe(true);
        if (!Array.isArray(open) || !Array.isArray(open[1])) {
            return;
        }
        expect(open[1][1]).toMatchObject({ token: "type", nextEmbedded: markdownFenceLanguageId });
        const body = markdownFenceBody(language);
        const listRule = body.tokenizer.root?.find((rule) => Array.isArray(rule) && rule[0] instanceof RegExp && rule[0].source.includes("\\d+"));
        expect(listRule).toBeUndefined();
    });
});
