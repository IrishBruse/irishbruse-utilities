import type * as monaco from "monaco-editor";

type Language = monaco.languages.IMonarchLanguage;
type Rule = monaco.languages.IMonarchLanguageRule;

const backtickWithLanguage = "^\\s*```\\s*((?:\\w|[\\/\\-#])+).*$";
const backtickBare = "^\\s*```\\s*$";
const tildeOpen = "^\\s*~~~\\s*((?:\\w|[\\/\\-#])+)?\\s*$";

const languageName = "(?:\\w|[\\/\\-#])+";

function sourceOf(rule: Rule): string | undefined {
    return Array.isArray(rule) && rule[0] instanceof RegExp ? rule[0].source : undefined;
}

function backtickRules(): Rule[] {
    const typed = { token: "type", next: "@codeblockgh", nextEmbedded: "$2" };
    return [
        [new RegExp(`^(\\s*\`{3,})(${languageName})(\\s+\\S.*)$`), ["punctuation", typed, "type"]],
        [new RegExp(`^(\\s*\`{3,})(${languageName})(\\s+)$`), ["punctuation", typed, ""]],
        [new RegExp(`^(\\s*\`{3,})(${languageName})$`), ["punctuation", typed]],
        [/^(\s*`{3,}\s*)$/, { token: "punctuation", next: "@codeblock" }],
    ];
}

function tildeRules(): Rule[] {
    return [
        [new RegExp(`^(\\s*~{3,})(${languageName}.*)$`), ["punctuation", { token: "type", next: "@codeblock" }]],
        [/^(\s*~{3,}\s*)$/, { token: "punctuation", next: "@codeblock" }],
    ];
}

function recolorClose(rule: Rule): Rule {
    const source = sourceOf(rule);
    if (source === "^\\s*```\\s*$") {
        return [/^\s*```\s*$/, { token: "punctuation", next: "@pop" }];
    }
    if (source === "^\\s*~~~\\s*$") {
        return [/^\s*~~~\s*$/, { token: "punctuation", next: "@pop" }];
    }
    return rule;
}

function recolorEmbeddedClose(rule: Rule): Rule {
    if (sourceOf(rule) === "```\\s*$") {
        return [/```\s*$/, { token: "punctuation", next: "@pop", nextEmbedded: "@pop" }];
    }
    return rule;
}

export function markdownWithFenceColors(language: Language): Language {
    const tokenizer: Language["tokenizer"] = { ...language.tokenizer };
    let opened = false;
    tokenizer.root = (tokenizer.root ?? []).flatMap((rule) => {
        const source = sourceOf(rule);
        if (source === backtickWithLanguage || source === backtickBare) {
            if (opened) {
                return [];
            }
            opened = true;
            return backtickRules();
        }
        if (source === tildeOpen) {
            return tildeRules();
        }
        return [rule];
    });
    tokenizer.codeblock = (tokenizer.codeblock ?? []).map(recolorClose);
    tokenizer.codeblockgh = (tokenizer.codeblockgh ?? []).map(recolorEmbeddedClose);
    return { ...language, tokenizer };
}
