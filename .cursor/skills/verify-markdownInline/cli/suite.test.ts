import { describe, expect, it } from "vitest";
import { parseMap, validateSuite, type Feature } from "./suite.ts";

function feature(overrides: Partial<Feature> & Pick<Feature, "name">): Feature {
    return {
        does: "Shows the feature",
        reach: "none",
        activate: "offset=1",
        from: "entry",
        sequence: false,
        ...overrides,
    };
}

describe("validateSuite", () => {
    it("accepts a map whose evidence names match", () => {
        const features = [feature({ name: "Rendered document" })];
        expect(validateSuite(features, ["Rendered document"])).toEqual([]);
    });

    it("rejects a feature with no evidence and evidence with no feature", () => {
        const features = [feature({ name: "Heading" })];
        expect(validateSuite(features, ["Bold"])).toEqual([
            "No evidence for Heading",
            "Evidence has no feature: Bold",
        ]);
    });

    it("rejects a locator the runner cannot perform", () => {
        const features = [feature({ name: "Heading", activate: "click the title" })];
        expect(validateSuite(features, ["Heading"])).toEqual([
            "Heading: Activate is not a locator: click the title",
        ]);
    });

    it("rejects a From parent that is not a feature", () => {
        const features = [feature({ name: "Heading", from: "Missing" })];
        expect(validateSuite(features, ["Heading"])).toEqual([
            "Heading From is not a feature: Missing",
        ]);
    });

    it("rejects a cycle", () => {
        const features = [
            feature({ name: "A", from: "B" }),
            feature({ name: "B", from: "A" }),
        ];
        expect(validateSuite(features, ["A", "B"])).toEqual([
            "Cycle at A",
            "Cycle at B",
        ]);
    });
});

describe("parseMap", () => {
    it("reads Sequence yes", () => {
        const features = parseMap(`# Feature map

## Mermaid

Does: Paint the diagram again.
Reach: none
Activate: .inline-md-mermaid-open-preview
From: entry
Sequence: yes
`);
        expect(features).toEqual([
            {
                name: "Mermaid",
                does: "Paint the diagram again.",
                reach: "none",
                activate: ".inline-md-mermaid-open-preview",
                from: "entry",
                sequence: true,
            },
        ]);
    });

    it("rejects any other Sequence value", () => {
        expect(() => parseMap(`# Feature map

## Mermaid

Does: Paint the diagram again.
Reach: none
Activate: offset=1
From: entry
Sequence: no
`)).toThrow("Sequence for Mermaid must be yes");
    });
});
