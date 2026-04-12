/**
 * Spawn configuration for an ACP agent subprocess. Shared by the extension
 * settings shape and the standalone server's JSON config file.
 */
export type AcpAgentSpawnConfig = {
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
};

/**
 * Parses `acp-agent.json`: a non-empty array of agent objects, or a single agent object
 * (accepted for backward compatibility).
 */
export function parseAcpAgentsJsonFileContent(content: unknown): AcpAgentSpawnConfig[] | undefined {
    if (Array.isArray(content)) {
        const result: AcpAgentSpawnConfig[] = [];
        for (const entry of content) {
            const one = parseAcpAgentSpawnConfig(entry);
            if (one !== undefined) {
                result.push(one);
            }
        }
        return result.length > 0 ? result : undefined;
    }
    const single = parseAcpAgentSpawnConfig(content);
    return single !== undefined ? [single] : undefined;
}

/** Parses one agent entry from settings or a JSON file. Returns undefined if invalid. */
export function parseAcpAgentSpawnConfig(entry: unknown): AcpAgentSpawnConfig | undefined {
    if (entry === null || typeof entry !== "object") {
        return undefined;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string" || typeof record.command !== "string") {
        return undefined;
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
    return { name: record.name, command: record.command, args, env };
}
