import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 6,
                sourceType: "module",
            },
        },
        plugins: {
            "@typescript-eslint": tseslint,
        },
        rules: {
            "@typescript-eslint/naming-convention": [
                "warn",
                {
                    selector: "import",
                    format: ["camelCase", "PascalCase"],
                },
            ],
            curly: "warn",
            eqeqeq: "warn",
            "no-throw-literal": "warn",
            semi: "off",
        },
    },
    {
        files: ["webview/**/*.ts", "webview/**/*.tsx"],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: "module",
                ecmaFeatures: { jsx: true },
            },
            globals: {
                window: "readonly",
                document: "readonly",
            },
        },
        plugins: {
            "@typescript-eslint": tseslint,
        },
        rules: {
            "@typescript-eslint/naming-convention": [
                "warn",
                {
                    selector: "import",
                    format: ["camelCase", "PascalCase"],
                },
            ],
            curly: "warn",
            eqeqeq: "warn",
            "no-throw-literal": "warn",
            semi: "off",
        },
    },
    {
        ignores: ["out", "dist", "**/*.d.ts", "media/ib-chat/**"],
    },
];
