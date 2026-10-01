import { completeSkillPropertyKeys } from "../../markdownEditor/webview/skillFrontMatterYaml";

const AGENT_PROPERTY_KEYS = ["paths", "icon", "color"] as const;

export function completeAgentPropertyKeys(existingKeys: readonly string[], prefix: string): string[] {
    const keys = completeSkillPropertyKeys(existingKeys, prefix);
    const used = new Set(existingKeys);
    const needle = prefix.toLowerCase();
    const extra = AGENT_PROPERTY_KEYS.filter((key) => !used.has(key) && key.startsWith(needle));
    return [...keys, ...extra];
}

export function agentPropertyCompletions(existingKeys: readonly string[], lineBeforeCursor: string): string[] | undefined {
    if (lineBeforeCursor.includes(":") || !/^[A-Za-z0-9_-]*$/.test(lineBeforeCursor)) {
        return undefined;
    }
    return completeAgentPropertyKeys(existingKeys, lineBeforeCursor);
}
