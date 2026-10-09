import { completeSkillPropertyKeys } from "./skillFrontMatterYaml";

export function completeAgentPropertyKeys(existingKeys: readonly string[], prefix: string): string[] {
    return completeSkillPropertyKeys(existingKeys, prefix);
}

export function skillPropertyInsertText(key: string, hasColon: boolean): string {
    if (hasColon) {
        return key;
    }
    if (key === "disable-model-invocation") {
        return "disable-model-invocation: true";
    }
    if (key === "metadata") {
        return "metadata:\n  author: example-org\n  version: \"1.0\"";
    }
    return `${key}: `;
}

export function agentPropertyCompletions(existingKeys: readonly string[], lineBeforeCursor: string): string[] | undefined {
    if (lineBeforeCursor.includes(":") || !/^[A-Za-z0-9_-]*$/.test(lineBeforeCursor)) {
        return undefined;
    }
    return completeAgentPropertyKeys(existingKeys, lineBeforeCursor);
}
