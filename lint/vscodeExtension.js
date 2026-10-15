import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { definePlugin, defineRule } from "vite-plus/lint/plugins";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const contributedCommands = new Set(
    packageJson.contributes.commands.map((command) => command.command),
);
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
        const key =
            property.key.type === "Identifier" ? property.key.name : stringValue(property.key);
        const value = stringValue(property.value);
        if (key !== undefined && value !== undefined) {
            entries.push({ key, value, node: property });
        }
    }
    return entries;
}

function exportedObject(sourceCode, name) {
    for (const statement of sourceCode.ast.body) {
        if (
            statement.type !== "ExportNamedDeclaration" ||
            statement.declaration?.type !== "VariableDeclaration"
        ) {
            continue;
        }
        for (const declarator of statement.declaration.declarations) {
            if (
                declarator.id.type === "Identifier" &&
                declarator.id.name === name &&
                declarator.init
            ) {
                return objectEntries(declarator.init);
            }
        }
    }
    return [];
}

const contributionSync = defineRule({
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
                    {
                        name: "Commands",
                        group: "command",
                        contributed: contributedCommands,
                        prefix: "ib-utilities.",
                    },
                    { name: "Views", group: "view", contributed: contributedViews, prefix: "" },
                    {
                        name: "Configuration",
                        group: "setting",
                        contributed: contributedSettings,
                        prefix: "",
                    },
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
});

const noDroppedDisposable = defineRule({
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
});

export default definePlugin({
    meta: { name: "vscode" },
    rules: {
        "contribution-sync": contributionSync,
        "no-dropped-disposable": noDroppedDisposable,
    },
});
