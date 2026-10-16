import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { definePlugin, defineRule } from "vite-plus/lint/plugins";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

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

function hasExportedBinding(sourceCode, name) {
    for (const statement of sourceCode.ast.body) {
        if (statement.type !== "ExportNamedDeclaration") {
            continue;
        }
        if (statement.declaration?.type === "VariableDeclaration") {
            for (const declarator of statement.declaration.declarations) {
                if (declarator.id.type === "Identifier" && declarator.id.name === name) {
                    return true;
                }
            }
        }
        for (const specifier of statement.specifiers ?? []) {
            if (specifier.exported.type === "Identifier" && specifier.exported.name === name) {
                return true;
            }
        }
    }
    return false;
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

function disposableCallInfo(node) {
    if (node?.type !== "CallExpression" || node.callee.type !== "MemberExpression") {
        return undefined;
    }
    const property = node.callee.property;
    if (property.type !== "Identifier" || !disposableMethods.has(property.name)) {
        return undefined;
    }
    let object = node.callee.object;
    while (object.type === "MemberExpression") {
        object = object.object;
    }
    if (object.type === "Identifier" && object.name === "monaco") {
        return undefined;
    }
    return { method: property.name, node };
}

function isSubscriptionsPush(call) {
    if (call.type !== "CallExpression" || call.callee.type !== "MemberExpression") {
        return false;
    }
    const callee = call.callee;
    if (callee.property.type !== "Identifier" || callee.property.name !== "push") {
        return false;
    }
    if (
        callee.object.type === "MemberExpression" &&
        callee.object.property.type === "Identifier" &&
        callee.object.property.name === "subscriptions"
    ) {
        return true;
    }
    return false;
}

function parseActivationEvents(events) {
    const onView = new Set();
    const onCustomEditor = new Set();
    const onCommand = new Set();
    let startupFinished = false;
    let star = false;
    for (const event of events ?? []) {
        if (event === "onStartupFinished") {
            startupFinished = true;
        } else if (event === "*") {
            star = true;
        } else if (event.startsWith("onView:")) {
            onView.add(event.slice("onView:".length));
        } else if (event.startsWith("onCustomEditor:")) {
            onCustomEditor.add(event.slice("onCustomEditor:".length));
        } else if (event.startsWith("onCommand:")) {
            onCommand.add(event.slice("onCommand:".length));
        }
    }
    return { onView, onCustomEditor, onCommand, startupFinished, star };
}

function contributedSets(packageJson) {
    const contributes = packageJson.contributes ?? {};
    const contributedCommands = new Set(
        (contributes.commands ?? []).map((command) => command.command),
    );
    const contributedViews = new Set(
        Object.values(contributes.views ?? {})
            .flat()
            .map((view) => view.id),
    );
    const contributedCustomEditors = new Set(
        (contributes.customEditors ?? []).map((editor) => editor.viewType),
    );
    const contributedSettings = new Set(Object.keys(contributes.configuration?.properties ?? {}));
    return {
        contributedCommands,
        contributedViews,
        contributedCustomEditors,
        contributedSettings,
    };
}

export function createVscodePlugin(packageJson) {
    const { contributedCommands, contributedViews, contributedCustomEditors, contributedSettings } =
        contributedSets(packageJson);
    const activation = parseActivationEvents(packageJson.activationEvents);

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
                        {
                            name: "Views",
                            group: "view",
                            contributed: contributedViews,
                            prefix: "",
                        },
                        {
                            name: "Configuration",
                            group: "setting",
                            contributed: contributedSettings,
                            prefix: "",
                        },
                    ];
                    for (const group of groups) {
                        if (!hasExportedBinding(sourceCode, group.name)) {
                            continue;
                        }
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
                                    data: {
                                        group: group.group,
                                        key: entry.key,
                                        value: entry.value,
                                    },
                                });
                            }
                        }
                        for (const value of group.contributed) {
                            if (group.prefix && !value.startsWith(group.prefix)) {
                                continue;
                            }
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
                dropped:
                    "Push this {{method}} disposable onto context.subscriptions, or dispose it.",
            },
        },
        create(context) {
            const droppedBindings = new Map();
            const retainedBindings = new Set();

            return {
                ExpressionStatement(node) {
                    const info = disposableCallInfo(node.expression);
                    if (!info) {
                        return;
                    }
                    context.report({
                        node: info.node,
                        messageId: "dropped",
                        data: { method: info.method },
                    });
                },
                VariableDeclarator(node) {
                    if (node.id.type !== "Identifier" || !node.init) {
                        return;
                    }
                    const info = disposableCallInfo(node.init);
                    if (!info) {
                        return;
                    }
                    droppedBindings.set(node.id.name, info);
                },
                AssignmentExpression(node) {
                    if (node.left.type !== "Identifier") {
                        return;
                    }
                    const info = disposableCallInfo(node.right);
                    if (!info) {
                        return;
                    }
                    droppedBindings.set(node.left.name, info);
                },
                CallExpression(node) {
                    if (isSubscriptionsPush(node)) {
                        for (const argument of node.arguments) {
                            if (argument.type === "Identifier") {
                                retainedBindings.add(argument.name);
                            }
                        }
                    }
                    if (
                        node.callee.type === "MemberExpression" &&
                        node.callee.property.type === "Identifier" &&
                        node.callee.property.name === "dispose" &&
                        node.callee.object.type === "Identifier"
                    ) {
                        retainedBindings.add(node.callee.object.name);
                    }
                },
                "Program:exit"() {
                    for (const [name, info] of droppedBindings) {
                        if (retainedBindings.has(name)) {
                            continue;
                        }
                        context.report({
                            node: info.node,
                            messageId: "dropped",
                            data: { method: info.method },
                        });
                    }
                },
            };
        },
    });

    const activationEventsRule = defineRule({
        meta: {
            type: "problem",
            schema: [],
            messages: {
                unknownActivationView:
                    "activationEvents onView:{{id}} does not match a contributed view.",
                unknownActivationCustomEditor:
                    "activationEvents onCustomEditor:{{id}} does not match a contributed custom editor.",
                unknownActivationCommand:
                    "activationEvents onCommand:{{id}} does not match a contributed command.",
                uncoveredView:
                    'Contributed view "{{id}}" needs onView:{{id}}, onStartupFinished, or *.',
                uncoveredCustomEditor:
                    'Contributed custom editor "{{id}}" needs onCustomEditor:{{id}}, onStartupFinished, or *.',
            },
        },
        create(context) {
            return {
                Program(programNode) {
                    const sourceCode = context.sourceCode;
                    if (!hasExportedBinding(sourceCode, "Commands")) {
                        return;
                    }
                    const reportAtProgram = (messageId, data) => {
                        context.report({
                            node: programNode,
                            messageId,
                            data,
                        });
                    };
                    for (const id of activation.onView) {
                        if (!contributedViews.has(id)) {
                            reportAtProgram("unknownActivationView", { id });
                        }
                    }
                    for (const id of activation.onCustomEditor) {
                        if (!contributedCustomEditors.has(id)) {
                            reportAtProgram("unknownActivationCustomEditor", { id });
                        }
                    }
                    for (const id of activation.onCommand) {
                        if (!contributedCommands.has(id)) {
                            reportAtProgram("unknownActivationCommand", { id });
                        }
                    }
                    const coversAll = activation.star || activation.startupFinished;
                    if (!coversAll) {
                        for (const id of contributedViews) {
                            if (!activation.onView.has(id)) {
                                reportAtProgram("uncoveredView", { id });
                            }
                        }
                        for (const id of contributedCustomEditors) {
                            if (!activation.onCustomEditor.has(id)) {
                                reportAtProgram("uncoveredCustomEditor", { id });
                            }
                        }
                    }
                },
            };
        },
    });

    return definePlugin({
        meta: { name: "vscode" },
        rules: {
            "contribution-sync": contributionSync,
            "no-dropped-disposable": noDroppedDisposable,
            "activation-events": activationEventsRule,
        },
    });
}

export default createVscodePlugin(packageJson);
