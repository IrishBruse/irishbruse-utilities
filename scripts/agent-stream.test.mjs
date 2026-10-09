import assert from "node:assert/strict";
import test from "node:test";
import { createAgentPrinter } from "./agent-stream.mjs";

function capture(lines) {
    let text = "";
    const printer = createAgentPrinter((chunk) => {
        text += chunk;
    });
    for (const line of lines) {
        printer.writeLine(line);
    }
    printer.finish();
    return { text, printer };
}

test("streams assistant text and tool lines", () => {
    const { text } = capture([
        JSON.stringify({ type: "system", subtype: "init", model: "Composer" }),
        JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "hidden prompt" }] } }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Hel" }] } }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "lo" }] } }),
        JSON.stringify({
            type: "tool_call",
            subtype: "started",
            tool_call: { shellToolCall: { args: { command: "git status" } } },
        }),
        JSON.stringify({
            type: "tool_call",
            subtype: "completed",
            tool_call: { shellToolCall: { args: { command: "git status" }, result: { success: {} } } },
        }),
        JSON.stringify({ type: "result", subtype: "success", is_error: false, duration_ms: 4200, result: "Hello" }),
    ]);
    assert.equal(text, [
        "model  Composer",
        "Hello",
        "→ Shell  git status",
        "← Shell",
        "done  4.2s",
        "",
    ].join("\n"));
});

test("marks a failed result", () => {
    const { text, printer } = capture([
        JSON.stringify({ type: "result", subtype: "error", is_error: true, result: "boom" }),
    ]);
    assert.equal(printer.failed, true);
    assert.equal(printer.failureMessage, "boom");
    assert.match(text, /failed/);
    assert.match(text, /boom/);
});
