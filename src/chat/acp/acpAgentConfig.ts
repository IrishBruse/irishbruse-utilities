import { workspace } from "vscode";

/** Configuration for a single ACP agent that can be launched as a subprocess. */
export type AcpAgentConfig = {
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
};

const settingKey = "ib-utilities.acpAgents";

/** Reads ACP agent configurations from the VS Code user/workspace settings. */
export function getAcpAgentConfigs(): AcpAgentConfig[] {
    const raw = workspace.getConfiguration().get<unknown[]>(settingKey, []);
    const result: AcpAgentConfig[] = [];
    for (const entry of raw) {
        if (entry === null || typeof entry !== "object") {
            continue;
        }
        const record = entry as Record<string, unknown>;
        if (typeof record.name !== "string" || typeof record.command !== "string") {
            continue;
        }
        const args = Array.isArray(record.args) ? record.args.filter((a): a is string => typeof a === "string") : [];
        let env: Record<string, string> | undefined;
        if (record.env !== null && typeof record.env === "object" && !Array.isArray(record.env)) {
            env = {};
            for (const [k, v] of Object.entries(record.env as Record<string, unknown>)) {
                if (typeof v === "string") {
                    env[k] = v;
                }
            }
        }
        result.push({ name: record.name, command: record.command, args, env });
    }
    return result;
}

/** Returns the agent configuration with the given display name, if present. */
export function getAcpAgentConfigByName(name: string): AcpAgentConfig | undefined {
    return getAcpAgentConfigs().find((c) => c.name === name);
}
