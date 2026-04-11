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
