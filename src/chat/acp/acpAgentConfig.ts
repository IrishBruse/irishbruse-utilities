import { workspace } from "vscode";
import { parseAcpAgentSpawnConfig, type AcpAgentSpawnConfig } from "./acpAgentSpawnConfig";

/** Configuration for a single ACP agent that can be launched as a subprocess. */
export type AcpAgentConfig = AcpAgentSpawnConfig;

const settingKey = "ib-utilities.acpAgents";

/** Reads ACP agent configurations from the VS Code user/workspace settings. */
export function getAcpAgentConfigs(): AcpAgentConfig[] {
    const raw = workspace.getConfiguration().get<unknown[]>(settingKey, []);
    const result: AcpAgentConfig[] = [];
    for (const entry of raw) {
        const parsed = parseAcpAgentSpawnConfig(entry);
        if (parsed) {
            result.push(parsed);
        }
    }
    return result;
}

/** Returns the agent configuration with the given display name, if present. */
export function getAcpAgentConfigByName(name: string): AcpAgentConfig | undefined {
    return getAcpAgentConfigs().find((c) => c.name === name);
}
