import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

const noCommentsPlugin = {
    rules: {
        "no-comments": {
            meta: {
                type: "problem",
                fixable: "code",
                schema: [],
                messages: {
                    unexpected: "Comments are not allowed.",
                },
            },
            create(context) {
                return {
                    Program() {
                        for (const comment of context.sourceCode.getAllComments()) {
                            context.report({
                                loc: comment.loc,
                                messageId: "unexpected",
                                fix(fixer) {
                                    return fixer.remove(comment);
                                },
                            });
                        }
                    },
                };
            },
        },
    },
};

const sharedRules = {
    "ib/no-comments": "error",
    curly: "warn",
    eqeqeq: "warn",
    "no-throw-literal": "warn",
    semi: "off",
};

export default [
    {
        ignores: [
            ".tmp/**",
            "out/**",
            "dist/**",
            "**/dist/**",
            "node_modules/**",
            "media/**",
            "!media/mermaidPreview/preview.js",
            "**/*.min.js",
        ],
    },
    {
        files: ["**/*.{js,mjs,cjs}"],
        plugins: {
            ib: noCommentsPlugin,
        },
        rules: sharedRules,
    },
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
            },
        },
        plugins: {
            "@typescript-eslint": tseslint,
            ib: noCommentsPlugin,
        },
        rules: {
            ...sharedRules,
            "@typescript-eslint/naming-convention": [
                "warn",
                {
                    selector: "import",
                    format: ["camelCase", "PascalCase"],
                },
            ],
        },
    },
];
