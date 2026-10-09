import { parseSkillFrontMatter, type SkillProperty } from "./skillFrontMatterYaml";

export interface SkillFrontMatterIssue {
    readonly message: string;
    readonly start: number;
    readonly end: number;
}

const SPEC_FIELDS = ["name", "description", "license", "compatibility", "metadata", "allowed-tools"] as const;

const ALLOWED_FIELDS = new Set<string>([...SPEC_FIELDS, "disable-model-invocation", "user-invocable"]);

const OPEN_FENCE: SkillFrontMatterIssue = { message: "", start: -1, end: -1 };

export function skillFrontMatterIssues(yaml: string, directoryName: string | undefined): SkillFrontMatterIssue[] {
    const properties = parseSkillFrontMatter(yaml);
    const issues: SkillFrontMatterIssue[] = [];
    const name = properties.find((property) => property.key === "name");
    const description = properties.find((property) => property.key === "description");
    if (!name) {
        issues.push({ ...OPEN_FENCE, message: "name is required." });
    } else {
        issues.push(...nameIssues(yaml, name, directoryName));
    }
    if (!description) {
        issues.push({ ...OPEN_FENCE, message: "description is required." });
    } else {
        issues.push(...descriptionIssues(yaml, description));
    }
    const compatibility = properties.find((property) => property.key === "compatibility");
    if (compatibility) {
        issues.push(...compatibilityIssues(yaml, compatibility));
    }
    const metadata = properties.find((property) => property.key === "metadata");
    if (metadata && metadata.kind !== "map") {
        issues.push(fieldIssue(yaml, "metadata", "metadata must be a map from string keys to string values."));
    }
    const allowedTools = properties.find((property) => property.key === "allowed-tools");
    if (allowedTools && (allowedTools.kind !== "string" || fieldIsSequence(yaml, "allowed-tools") || allowedTools.value.includes("\n"))) {
        issues.push(fieldIssue(yaml, "allowed-tools", "allowed-tools must be a space-separated string."));
    }
    for (const property of properties) {
        if (ALLOWED_FIELDS.has(property.key)) {
            continue;
        }
        issues.push(fieldIssue(
            yaml,
            property.key,
            `Unexpected field '${property.key}'. The spec allows ${specFieldList()}.`,
        ));
    }
    return issues;
}

function nameIssues(yaml: string, property: SkillProperty, directoryName: string | undefined): SkillFrontMatterIssue[] {
    const value = property.kind === "string" ? property.value : "";
    if (value.trim() === "") {
        return [fieldIssue(yaml, "name", "name must be 1 to 64 characters.")];
    }
    const issues: SkillFrontMatterIssue[] = [];
    if (value.length > 64) {
        issues.push(fieldIssue(yaml, "name", "name must be at most 64 characters."));
    }
    if (!/^[a-z0-9-]+$/.test(value)) {
        issues.push(fieldIssue(yaml, "name", "name must use lowercase letters, numbers, and hyphens."));
    } else {
        if (value.startsWith("-") || value.endsWith("-")) {
            issues.push(fieldIssue(yaml, "name", "name must not start or end with a hyphen."));
        }
        if (value.includes("--")) {
            issues.push(fieldIssue(yaml, "name", "name must not contain consecutive hyphens."));
        }
    }
    if (directoryName !== undefined && value !== directoryName) {
        issues.push(fieldIssue(yaml, "name", "name must match the parent directory name."));
    }
    return issues;
}

function descriptionIssues(yaml: string, property: SkillProperty): SkillFrontMatterIssue[] {
    const value = property.kind === "string" ? property.value : "";
    if (value.trim() === "") {
        return [fieldIssue(yaml, "description", "description must be 1 to 1024 characters.")];
    }
    if (value.length > 1024) {
        return [fieldIssue(yaml, "description", "description must be at most 1024 characters.")];
    }
    return [];
}

function compatibilityIssues(yaml: string, property: SkillProperty): SkillFrontMatterIssue[] {
    const value = property.kind === "string" ? property.value : "";
    if (property.kind !== "string" || value.trim() === "") {
        return [fieldIssue(yaml, "compatibility", "compatibility must be 1 to 500 characters.")];
    }
    if (value.length > 500) {
        return [fieldIssue(yaml, "compatibility", "compatibility must be at most 500 characters.")];
    }
    return [];
}

function specFieldList(): string {
    const last = SPEC_FIELDS.at(-1) ?? "";
    return `${SPEC_FIELDS.slice(0, -1).join(", ")}, and ${last}`;
}

function fieldIssue(yaml: string, key: string, message: string): SkillFrontMatterIssue {
    const span = fieldLine(yaml, key);
    if (!span) {
        return { message, start: -1, end: -1 };
    }
    return { message, start: span.start, end: span.end };
}

function fieldLine(yaml: string, key: string): { start: number; end: number } | undefined {
    const normalized = yaml.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    let offset = 0;
    for (const line of normalized.split("\n")) {
        const match = /^([A-Za-z0-9_-]+)\s*:/.exec(line);
        if (match?.[1] === key) {
            return { start: offset, end: offset + line.length };
        }
        offset += line.length + 1;
    }
    return undefined;
}

function fieldIsSequence(yaml: string, key: string): boolean {
    const lines = yaml.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const index = lines.findIndex((line) => /^([A-Za-z0-9_-]+)\s*:/.exec(line)?.[1] === key);
    if (index < 0) {
        return false;
    }
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const line = lines[cursor] ?? "";
        if (line.trim() === "" || line.trimStart().startsWith("#")) {
            continue;
        }
        return /^\s+-\s+/.test(line);
    }
    return false;
}
