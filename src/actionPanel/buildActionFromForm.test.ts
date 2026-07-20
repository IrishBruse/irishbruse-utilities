import { describe, expect, it } from "vitest";
import { buildActionFromForm } from "./buildActionFromForm";

describe("buildActionFromForm", () => {
    it("builds an agent action with a preferred id", () => {
        const result = buildActionFromForm(
            {
                label: "Create PR",
                type: "agent",
                icon: "git-pull-request-create",
                prompt: "/pr create",
            },
            new Set(),
            "createPR"
        );

        expect(result).toEqual({
            ok: true,
            action: {
                id: "createPR",
                label: "Create PR",
                type: "agent",
                icon: "git-pull-request-create",
                prompt: "/pr create",
            },
        });
    });

    it("builds a command action", () => {
        const result = buildActionFromForm(
            {
                label: "New Terminal",
                type: "command",
                command: "workbench.action.terminal.new",
            },
            new Set()
        );

        expect(result).toEqual({
            ok: true,
            action: {
                id: "newTerminal",
                label: "New Terminal",
                type: "command",
                command: "workbench.action.terminal.new",
            },
        });
    });

    it("builds a terminal action with run options", () => {
        const result = buildActionFromForm(
            {
                label: "Run tests",
                type: "terminal",
                command: "npm test",
                terminalMode: "editor",
            },
            new Set()
        );

        expect(result).toEqual({
            ok: true,
            action: {
                id: "runTests",
                label: "Run tests",
                type: "terminal",
                command: "npm test",
                terminalMode: "editor",
            },
        });
    });

    it("returns validation errors", () => {
        expect(buildActionFromForm({ label: "", type: "agent", prompt: "/x" }, new Set())).toEqual({
            ok: false,
            error: "Label is required.",
            field: "label",
        });
        expect(buildActionFromForm({ label: "Deploy", type: "agent" }, new Set())).toEqual({
            ok: false,
            error: "Prompt is required for agent actions.",
            field: "prompt",
        });
        expect(buildActionFromForm({ label: "Run", type: "command" }, new Set())).toEqual({
            ok: false,
            error: "Command is required for VS Code command actions.",
            field: "command",
        });
        expect(buildActionFromForm({ label: "Run", type: "terminal" }, new Set())).toEqual({
            ok: false,
            error: "Command is required for terminal actions.",
            field: "command",
        });
    });
});
