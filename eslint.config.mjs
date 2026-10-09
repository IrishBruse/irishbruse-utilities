import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const contributedCommands = new Set(packageJson.contributes.commands.map((command) => command.command));
const contributedViews = new Set(
    Object.values(packageJson.contributes.views)
        .flat()
        .map((view) => view.id),
);
const contributedSettings = new Set(Object.keys(packageJson.contributes.configuration.properties));

const disposableMethods = new Set([
    "createDiagnosticCollection",
    "createFileSystemWatcher",
    "createOutputChannel",
    "createStatusBarItem",
    "createTerminal",
    "createTextEditorDecorationType",
    "createTreeView",
    "onDidChange",
    "onDidChangeActiveColorTheme",
    "onDidChangeActiveTextEditor",
    "onDidChangeConfiguration",
    "onDidChangeState",
    "onDidChangeTabs",
    "onDidChangeTextDocument",
    "onDidChangeVisibility",
    "onDidChangeWorkspaceFolders",
    "onDidCloseRepository",
    "onDidCreateFiles",
    "onDidDeleteFiles",
    "onDidDispose",
    "onDidOpenRepository",
    "onDidRenameFiles",
    "onDidSaveTextDocument",
    "registerCommand",
    "registerCustomEditorProvider",
    "registerTextEditorCommand",
    "registerWebviewPanelSerializer",
    "registerWebviewViewProvider",
]);

function stringValue(node) {
    if (node.type === "Literal" && typeof node.value === "string") {
        return node.value;
    }
    if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
        return node.quasis[0].value.cooked;
    }
    return undefined;
}

function objectEntries(node) {
    let expression = node;
    if (expression.type === "TSAsExpression" || expression.type === "TSSatisfiesExpression") {
        expression = expression.expression;
    }
    if (expression.type !== "ObjectExpression") {
        return [];
    }
    const entries = [];
    for (const property of expression.properties) {
        if (property.type !== "Property" || property.computed) {
            continue;
        }
        const key = property.key.type === "Identifier" ? property.key.name : stringValue(property.key);
        const value = stringValue(property.value);
        if (key !== undefined && value !== undefined) {
            entries.push({ key, value, node: property });
        }
    }
    return entries;
}

function exportedObject(sourceCode, name) {
    for (const statement of sourceCode.ast.body) {
        if (statement.type !== "ExportNamedDeclaration" || statement.declaration?.type !== "VariableDeclaration") {
            continue;
        }
        for (const declarator of statement.declaration.declarations) {
            if (declarator.id.type === "Identifier" && declarator.id.name === name && declarator.init) {
                return objectEntries(declarator.init);
            }
        }
    }
    return [];
}

const ibPlugin = {
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
        "contribution-sync": {
            meta: {
                type: "problem",
                schema: [],
                messages: {
                    missingInPackage: "{{group}}.{{key}} ({{value}}) is not in package.json.",
                    missingInSource: "package.json {{group}} {{value}} is not in {{name}}.",
                },
            },
            create(context) {
                return {
                    Program() {
                        const sourceCode = context.sourceCode;
                        const groups = [
                            { name: "Commands", group: "command", contributed: contributedCommands, prefix: "ib-utilities." },
                            { name: "Views", group: "view", contributed: contributedViews, prefix: "" },
                            { name: "Configuration", group: "setting", contributed: contributedSettings, prefix: "" },
                        ];
                        for (const group of groups) {
                            const entries = exportedObject(sourceCode, group.name);
                            const values = new Set();
                            for (const entry of entries) {
                                if (group.prefix && !entry.value.startsWith(group.prefix)) {
                                    continue;
                                }
                                values.add(entry.value);
                                if (!group.contributed.has(entry.value)) {
                                    context.report({
                                        node: entry.node,
                                        messageId: "missingInPackage",
                                        data: { group: group.group, key: entry.key, value: entry.value },
                                    });
                                }
                            }
                            for (const value of group.contributed) {
                                if (!values.has(value)) {
                                    context.report({
                                        loc: sourceCode.ast.loc,
                                        messageId: "missingInSource",
                                        data: { group: group.group, value, name: group.name },
                                    });
                                }
                            }
                        }
                    },
                };
            },
        },
        "no-dropped-disposable": {
            meta: {
                type: "problem",
                schema: [],
                messages: {
                    dropped: "Push this {{method}} disposable onto context.subscriptions, or dispose it.",
                },
            },
            create(context) {
                return {
                    ExpressionStatement(node) {
                        const call = node.expression;
                        if (call.type !== "CallExpression" || call.callee.type !== "MemberExpression") {
                            return;
                        }
                        const property = call.callee.property;
                        if (property.type !== "Identifier" || !disposableMethods.has(property.name)) {
                            return;
                        }
                        let object = call.callee.object;
                        while (object.type === "MemberExpression") {
                            object = object.object;
                        }
                        if (object.type === "Identifier" && object.name === "monaco") {
                            return;
                        }
                        context.report({
                            node: call,
                            messageId: "dropped",
                            data: { method: property.name },
                        });
                    },
                };
            },
        },
    },
};

const sharedRules = {
    "ib/no-comments": "error",
    curly: ["error", "all"],
    eqeqeq: ["error", "always"],
    "no-debugger": "error",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-throw-literal": "off",
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
    js.configs.recommended,
    {
        files: ["**/*.{js,mjs,cjs}"],
        languageOptions: {
            globals: globals.node,
        },
        plugins: {
            ib: ibPlugin,
        },
        rules: sharedRules,
    },
    ...tseslint.configs["flat/recommended"].map((config) => ({
        ...config,
        files: config.files ?? ["**/*.{ts,mts}"],
    })),
    {
        files: ["**/*.{ts,mts}"],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                project: ["./tsconfig.json", "./src/markdownInline/tsconfig.json", "./tsconfig.eslint.json"],
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            ib: ibPlugin,
        },
        rules: {
            ...sharedRules,
            "@typescript-eslint/await-thenable": "error",
            "@typescript-eslint/naming-convention": [
                "warn",
                {
                    selector: "import",
                    format: ["camelCase", "PascalCase"],
                },
            ],
            "@typescript-eslint/no-deprecated": [
                "error",
                {
                    allow: [
                        { from: "lib", name: "caretRangeFromPoint" },
                        { from: "lib", name: "charCode" },
                        { from: "lib", name: "execCommand" },
                        { from: "lib", name: "keyCode" },
                        { from: "lib", name: "which" },
                    ],
                },
            ],
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
            "@typescript-eslint/only-throw-error": "error",
            "@typescript-eslint/switch-exhaustiveness-check": [
                "error",
                { considerDefaultExhaustiveForUnions: true },
            ],
            "ib/no-dropped-disposable": "error",
        },
    },
    {
        files: ["src/constants.ts"],
        rules: {
            "ib/contribution-sync": "error",
        },
    },
    {
        files: ["src/global.d.ts"],
        rules: {
            "@typescript-eslint/no-empty-object-type": "off",
        },
    },
    {
        files: ["src/global.d.ts", "src/lib/vscode/vscode.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
    {
        files: ["**/*.test.ts", "**/*.browser.ts", "src/test/**/*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "ib/no-dropped-disposable": "off",
        },
    },
    {
        files: ["media/**/*.js"],
        languageOptions: {
            globals: {
                acquireVsCodeApi: "readonly",
                document: "readonly",
                window: "readonly",
                navigator: "readonly",
                HTMLElement: "readonly",
                KeyboardEvent: "readonly",
                MouseEvent: "readonly",
                WheelEvent: "readonly",
                PointerEvent: "readonly",
                requestAnimationFrame: "readonly",
                cancelAnimationFrame: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
            },
        },
    },
];
