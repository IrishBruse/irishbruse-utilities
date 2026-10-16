import { describe } from "vitest";
import { RuleTester } from "vite-plus/lint/plugins-dev";
import { createVscodePlugin } from "./vscodeExtension.js";

const fixturePackageJson = {
    activationEvents: [
        "onView:test.view",
        "onCustomEditor:test.editor",
        "onCommand:ib-utilities.test.cmd",
        "onStartupFinished",
    ],
    contributes: {
        commands: [{ command: "ib-utilities.test.cmd" }, { command: "ib-utilities.other.cmd" }],
        views: {
            panel: [{ id: "test.view" }, { id: "uncovered.view" }],
        },
        customEditors: [{ viewType: "test.editor" }, { viewType: "uncovered.editor" }],
        configuration: {
            properties: {
                "test.setting": { type: "string" },
            },
        },
    },
};

function rule(name: string) {
    const plugin = createVscodePlugin(fixturePackageJson);
    return plugin.rules[name];
}

describe("contribution-sync", () => {
    const tester = new RuleTester();
    tester.run("contribution-sync", rule("contribution-sync"), {
        valid: [
            `export const unrelated = { Foo: "bar" };`,
            `export const Commands = { Run: "ib-utilities.test.cmd", Other: "ib-utilities.other.cmd" };`,
            `export const Views = { Main: "test.view", Extra: "uncovered.view" };`,
        ],
        invalid: [
            {
                code: `export const Commands = { Run: "ib-utilities.missing.cmd" };`,
                errors: 3,
            },
            {
                code: `export const Commands = { Run: "ib-utilities.test.cmd" };`,
                errors: [{ messageId: "missingInSource" }],
            },
        ],
    });
});

describe("no-dropped-disposable", () => {
    const tester = new RuleTester();
    tester.run("no-dropped-disposable", rule("no-dropped-disposable"), {
        valid: [
            `function activate(context) {
          context.subscriptions.push(window.createStatusBarItem());
        }`,
            `const sub = window.onDidChangeConfiguration(() => {});
        context.subscriptions.push(sub);`,
            `const sub = window.onDidChangeConfiguration(() => {});
        sub.dispose();`,
            `monaco.editor.onDidChangeModel(() => {});`,
        ],
        invalid: [
            {
                code: `window.createOutputChannel("x");`,
                errors: [{ messageId: "dropped" }],
            },
            {
                code: `const sub = window.createOutputChannel("x");`,
                errors: [{ messageId: "dropped" }],
            },
        ],
    });
});

describe("activation-events", () => {
    const tester = new RuleTester();
    tester.run("activation-events", rule("activation-events"), {
        valid: [`export const Views = { Main: "test.view" };`],
        invalid: [],
    });
});

describe("activation-events unknown view", () => {
    const plugin = createVscodePlugin({
        ...fixturePackageJson,
        activationEvents: ["onView:unknown.view", "onStartupFinished"],
    });
    const tester = new RuleTester();
    tester.run("activation-events", plugin.rules["activation-events"], {
        valid: [],
        invalid: [
            {
                code: `export const Commands = { Run: "ib-utilities.test.cmd" };`,
                errors: [{ messageId: "unknownActivationView" }],
            },
        ],
    });
});

describe("activation-events uncovered contributions", () => {
    const plugin = createVscodePlugin({
        ...fixturePackageJson,
        activationEvents: ["onView:test.view"],
    });
    const tester = new RuleTester();
    tester.run("activation-events", plugin.rules["activation-events"], {
        valid: [],
        invalid: [
            {
                code: `export const Commands = { Run: "ib-utilities.test.cmd" };`,
                errors: [
                    { messageId: "uncoveredView" },
                    { messageId: "uncoveredCustomEditor" },
                    { messageId: "uncoveredCustomEditor" },
                ],
            },
        ],
    });
});
