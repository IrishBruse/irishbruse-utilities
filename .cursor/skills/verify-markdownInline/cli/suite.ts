export interface Feature {
    name: string;
    does: string;
    reach: string;
    activate: string;
    from: string;
    sequence: boolean;
}

const ACTIVATE = /^(?:offset=\d+|text="[^"]*"|alt="[^"]*"|role=\S+(?: name="[^"]*")?|[.#]\S+|input\[[^\]]+\])$/;

export function activationError(spec: string): string | undefined {
    if (ACTIVATE.test(spec)) {
        return undefined;
    }
    return `Activate is not a locator: ${spec}`;
}

export function parseMap(text: string): Feature[] {
    const chunks = text.split(/^## /m).slice(1);
    return chunks.map((chunk) => {
        const [nameLine, ...rest] = chunk.split("\n");
        const name = nameLine.trim();
        const body = rest.join("\n");
        const field = (label: string): string => {
            const match = body.match(new RegExp(`^${label}: (.*)$`, "m"));
            if (!match?.[1]) {
                throw new Error(`Missing ${label} for ${name}`);
            }
            return match[1];
        };
        const sequence = body.match(/^Sequence: (.*)$/m)?.[1]?.trim();
        if (sequence !== undefined && sequence !== "yes") {
            throw new Error(`Sequence for ${name} must be yes`);
        }
        return {
            name,
            does: field("Does"),
            reach: field("Reach"),
            activate: field("Activate"),
            from: field("From"),
            sequence: sequence === "yes",
        };
    });
}

export function validateSuite(features: readonly Feature[], evidenceNames: readonly string[]): string[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const feature of features) {
        if (seen.has(feature.name)) {
            problems.push(`Duplicate feature: ${feature.name}`);
        }
        seen.add(feature.name);
        if (feature.does.trim().length === 0) {
            problems.push(`Missing Does for ${feature.name}`);
        }
        const activate = activationError(feature.activate);
        if (activate) {
            problems.push(`${feature.name}: ${activate}`);
        }
        if (feature.reach.trim().length === 0) {
            problems.push(`Missing Reach for ${feature.name}`);
        }
    }
    const byName = new Map(features.map((feature) => [feature.name, feature]));
    for (const feature of features) {
        const walked = new Set<string>();
        let current: Feature | undefined = feature;
        while (current && current.from !== "entry") {
            if (walked.has(current.name)) {
                problems.push(`Cycle at ${feature.name}`);
                break;
            }
            walked.add(current.name);
            const parent = byName.get(current.from);
            if (!parent) {
                problems.push(`${current.name} From is not a feature: ${current.from}`);
                break;
            }
            current = parent;
        }
    }
    const evidence = new Set(evidenceNames);
    for (const name of seen) {
        if (!evidence.has(name)) {
            problems.push(`No evidence for ${name}`);
        }
    }
    for (const name of evidence) {
        if (!seen.has(name)) {
            problems.push(`Evidence has no feature: ${name}`);
        }
    }
    return problems;
}
