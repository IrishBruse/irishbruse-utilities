const labels = {
    shellToolCall: "Shell",
    editToolCall: "Edit",
    readToolCall: "Read",
    grepToolCall: "Search",
    globToolCall: "Find",
    deleteToolCall: "Delete",
    writeToolCall: "Write",
    lsToolCall: "List",
    semSearchToolCall: "Search",
    webSearchToolCall: "Web",
    webFetchToolCall: "Fetch",
    taskToolCall: "Task",
    mcpToolCall: "MCP",
};

function paint(text, code, color) {
    if (!color) {
        return text;
    }
    return `\x1b[${code}m${text}\x1b[0m`;
}

function toolParts(toolCall) {
    if (!toolCall || typeof toolCall !== "object") {
        return { name: "tool", args: {}, result: undefined, description: "" };
    }
    if (typeof toolCall.tool?.case === "string") {
        const value = toolCall.tool.value ?? {};
        return {
            name: toolCall.tool.case,
            args: value.args ?? {},
            result: value.result,
            description: typeof value.description === "string" ? value.description : "",
        };
    }
    const key = Object.keys(toolCall).find((name) => name.endsWith("ToolCall"));
    const body = key ? toolCall[key] : toolCall;
    return {
        name: key ?? "tool",
        args: body?.args ?? {},
        result: body?.result,
        description: typeof body?.description === "string" ? body.description : "",
    };
}

function clip(text) {
    const flat = text.replace(/\s+/g, " ").trim();
    if (flat.length <= 120) {
        return flat;
    }
    return `${flat.slice(0, 117)}...`;
}

function toolDetail(parts) {
    const args = parts.args ?? {};
    const command = args.command ?? args.cmd;
    if (typeof command === "string" && command.trim().length > 0) {
        return clip(command);
    }
    const path = args.path ?? args.filePath ?? args.targetFile ?? args.uri;
    if (typeof path === "string" && path.length > 0) {
        return path;
    }
    const pattern = args.pattern ?? args.query ?? args.glob;
    if (typeof pattern === "string" && pattern.length > 0) {
        return clip(pattern);
    }
    if (parts.description.length > 0) {
        return clip(parts.description);
    }
    return "";
}

function toolLabel(name) {
    return labels[name] ?? name.replace(/ToolCall$/, "");
}

function resultNote(result) {
    if (!result || typeof result !== "object") {
        return "";
    }
    if (typeof result.case === "string") {
        return result.case === "success" ? "" : result.case;
    }
    const key = Object.keys(result).find((name) => name !== "sandboxPolicy" && name !== "isBackground");
    if (!key || key === "success") {
        return "";
    }
    return key.replaceAll("_", " ");
}

function assistantText(event) {
    const content = event.message?.content;
    if (!Array.isArray(content)) {
        return "";
    }
    return content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("");
}

function seconds(duration) {
    if (typeof duration !== "number" || !Number.isFinite(duration)) {
        return "";
    }
    return `${(duration / 1000).toFixed(1)}s`;
}

export function createAgentPrinter(write, options = {}) {
    const color = options.color === true;
    let open = false;
    let mode = "";
    let failed = false;
    let failureMessage = "";

    function closeOpen() {
        if (!open) {
            return;
        }
        write("\n");
        open = false;
        mode = "";
    }

    function writeText(text, nextMode) {
        if (mode !== nextMode) {
            closeOpen();
            mode = nextMode;
        }
        if (text.length === 0) {
            return;
        }
        write(text);
        open = !text.endsWith("\n");
    }

    function writeLine(text) {
        closeOpen();
        write(`${text}\n`);
    }

    return {
        writeLine(line) {
            let event;
            try {
                event = JSON.parse(line);
            } catch {
                writeLine(line);
                return;
            }
            if (!event || typeof event !== "object") {
                return;
            }
            if (event.type === "system" && event.subtype === "init") {
                const model = typeof event.model === "string" && event.model.length > 0 ? event.model : "agent";
                writeLine(paint(`model  ${model}`, "2", color));
                return;
            }
            if (event.type === "user") {
                return;
            }
            if (event.type === "assistant") {
                writeText(assistantText(event), "text");
                return;
            }
            if (event.type === "thinking" && event.subtype === "delta" && typeof event.text === "string") {
                if (mode !== "think") {
                    closeOpen();
                    write(paint("thinking  ", "2", color));
                    mode = "think";
                    open = true;
                }
                write(paint(event.text, "2", color));
                open = true;
                return;
            }
            if (event.type === "thinking" && event.subtype === "completed") {
                closeOpen();
                return;
            }
            if (event.type === "tool_call") {
                const parts = toolParts(event.tool_call);
                const label = toolLabel(parts.name);
                const detail = toolDetail(parts);
                const completed = event.subtype === "completed";
                const mark = completed ? "←" : "→";
                const note = completed ? resultNote(parts.result) : "";
                const tail = [completed ? "" : detail, note].filter((part) => part.length > 0).join("  ");
                writeLine(paint(`${mark} ${label}${tail.length > 0 ? `  ${tail}` : ""}`, "36", color));
                return;
            }
            if (event.type === "result") {
                const elapsed = seconds(event.duration_ms);
                const bad = event.is_error === true || (event.subtype && event.subtype !== "success");
                writeLine(paint(bad ? `failed  ${elapsed}`.trim() : `done  ${elapsed}`.trim(), bad ? "31" : "2", color));
                if (bad) {
                    failed = true;
                    failureMessage = typeof event.result === "string" && event.result.length > 0
                        ? event.result
                        : "agent --print failed";
                    if (typeof event.result === "string" && event.result.length > 0) {
                        writeLine(event.result);
                    }
                }
                return;
            }
            if (typeof event.type === "string") {
                const subtype = typeof event.subtype === "string" ? `  ${event.subtype}` : "";
                writeLine(paint(`${event.type}${subtype}`, "2", color));
            }
        },
        finish() {
            closeOpen();
        },
        get failed() {
            return failed;
        },
        get failureMessage() {
            return failureMessage;
        },
    };
}
