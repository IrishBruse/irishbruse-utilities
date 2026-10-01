import {
    emptyProperty,
    parseSkillFrontMatter,
    serializeSkillFrontMatter,
    widgetForKey,
    type SkillMapEntry,
    type SkillProperty,
} from "../../markdownEditor/webview/skillFrontMatterYaml";
import { completeAgentPropertyKeys } from "./skillKeys";
import type { Scope } from "./types";

export interface FrontMatterSpan {
    readonly yamlStart: number;
    readonly yamlEnd: number;
    readonly end: number;
    readonly yaml: string;
}

export function readFrontMatter(text: string): FrontMatterSpan | undefined {
    if (!text.startsWith("---")) {
        return undefined;
    }
    const firstBreak = text.indexOf("\n");
    if (firstBreak < 0) {
        return undefined;
    }
    const opener = text.slice(0, firstBreak).replace(/\r$/, "");
    if (opener !== "---") {
        return undefined;
    }
    let index = firstBreak + 1;
    while (index <= text.length) {
        const next = text.indexOf("\n", index);
        const lineEnd = next === -1 ? text.length : next;
        const line = text.slice(index, lineEnd).replace(/\r$/, "");
        if (line === "---") {
            const end = next === -1 ? lineEnd : next + 1;
            return {
                yamlStart: firstBreak + 1,
                yamlEnd: index,
                end,
                yaml: text.slice(firstBreak + 1, index),
            };
        }
        if (next === -1) {
            return undefined;
        }
        index = next + 1;
    }
    return undefined;
}

export function yamlFrontMatterScope(span: FrontMatterSpan): Scope {
    return {
        kind: "codeBlock",
        start: 0,
        end: span.end,
        contentStart: span.yamlStart,
        contentEnd: span.yamlEnd,
        markers: [
            { start: 0, end: span.yamlStart },
            { start: span.yamlEnd, end: span.end },
        ],
        language: "yaml",
    };
}

export class SkillPropertiesPanel {
    readonly element: HTMLElement;
    private properties: SkillProperty[] = [];
    private collapsed = false;
    private addOpen = false;
    private addPrefix = "";
    private suggestionIndex = 0;
    private yaml = "";

    constructor(
        private readonly folderName: string,
        private readonly readOnly: boolean,
        private readonly onYaml: (yaml: string) => void,
        private readonly onLayout: () => void,
        private readonly onShowYaml: () => void,
    ) {
        this.element = document.createElement("div");
        this.element.className = "ib-skill-properties-panel";
        this.element.addEventListener("mousedown", (event) => {
            event.stopPropagation();
        });
        this.element.addEventListener("keydown", (event) => {
            event.stopPropagation();
            this.onKeyDown(event);
        });
    }

    sync(yaml: string): void {
        if (yaml === this.yaml) {
            return;
        }
        if (this.element.contains(document.activeElement)) {
            this.yaml = yaml;
            return;
        }
        this.yaml = yaml;
        this.properties = parseSkillFrontMatter(yaml);
        this.render();
    }

    private render(): void {
        const count = this.properties.length;
        const suggestions = this.addOpen ? this.suggestions() : [];
        this.suggestionIndex = Math.min(this.suggestionIndex, Math.max(0, suggestions.length - 1));
        this.element.replaceChildren();
        this.element.classList.toggle("ib-skill-properties-collapsed", this.collapsed);

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "ib-skill-properties-toggle";
        toggle.textContent = this.collapsed ? `▸ PROPERTIES (${count})` : `▾ PROPERTIES (${count})`;
        toggle.addEventListener("click", () => {
            this.collapsed = !this.collapsed;
            this.addOpen = false;
            this.render();
        });
        const header = document.createElement("div");
        header.className = "ib-skill-properties-header";
        const yamlButton = document.createElement("button");
        yamlButton.type = "button";
        yamlButton.className = "ib-skill-properties-mode";
        yamlButton.textContent = "YAML";
        yamlButton.addEventListener("click", () => {
            this.onShowYaml();
        });
        header.append(toggle, yamlButton);
        this.element.append(header);
        if (this.collapsed) {
            this.onLayout();
            return;
        }

        const body = document.createElement("div");
        body.className = "ib-skill-properties-body";
        for (const property of this.properties) {
            body.append(this.row(property));
        }
        body.append(this.addRow(suggestions));
        this.element.append(body);
        if (this.addOpen) {
            const input = this.element.querySelector(".ib-skill-properties-add-input");
            if (input instanceof HTMLInputElement) {
                input.focus();
            }
        }
        this.onLayout();
    }

    private row(property: SkillProperty): HTMLElement {
        if (property.kind === "map") {
            return this.mapBlock(property.key, property.entries);
        }
        const row = document.createElement("div");
        row.className = "ib-skill-properties-row";
        const key = document.createElement("span");
        key.className = "ib-skill-properties-key";
        key.textContent = property.key;
        row.append(key);
        const widget = widgetForKey(property.key);
        if (property.kind === "boolean" || widget === "boolean") {
            const select = document.createElement("select");
            select.className = "ib-skill-properties-value ib-skill-properties-select";
            select.disabled = this.readOnly;
            for (const optionValue of ["true", "false"]) {
                const option = document.createElement("option");
                option.value = optionValue;
                option.textContent = optionValue;
                select.append(option);
            }
            select.value = property.kind === "boolean" && property.value ? "true" : "false";
            select.addEventListener("change", () => {
                this.setProperty({ key: property.key, kind: "boolean", value: select.value === "true" });
            });
            row.append(select);
            return row;
        }
        if (widget === "multiline") {
            const textarea = document.createElement("textarea");
            textarea.className = "ib-skill-properties-value ib-skill-properties-multiline";
            textarea.rows = 3;
            textarea.disabled = this.readOnly;
            textarea.value = property.kind === "string" ? property.value : "";
            textarea.addEventListener("input", () => {
                this.setProperty({ key: property.key, kind: "string", value: textarea.value });
            });
            row.append(textarea);
            return row;
        }
        const input = document.createElement("input");
        input.type = "text";
        input.className = "ib-skill-properties-value";
        input.disabled = this.readOnly;
        input.value = property.kind === "string" ? property.value : "";
        if (property.key === "name" && this.folderName.length > 0) {
            input.placeholder = this.folderName;
        }
        input.addEventListener("input", () => {
            this.setProperty({ key: property.key, kind: "string", value: input.value });
        });
        row.append(input);
        return row;
    }

    private mapBlock(key: string, entries: readonly SkillMapEntry[]): HTMLElement {
        const block = document.createElement("div");
        block.className = "ib-skill-properties-map";
        const header = document.createElement("div");
        header.className = "ib-skill-properties-row";
        const label = document.createElement("span");
        label.className = "ib-skill-properties-key";
        label.textContent = key;
        header.append(label);
        block.append(header);
        entries.forEach((entry, index) => {
            const row = document.createElement("div");
            row.className = "ib-skill-properties-row ib-skill-properties-nested";
            const keyInput = document.createElement("input");
            keyInput.type = "text";
            keyInput.className = "ib-skill-properties-map-key";
            keyInput.disabled = this.readOnly;
            keyInput.value = entry.key;
            keyInput.addEventListener("input", () => {
                this.setMapEntry(key, index, { key: keyInput.value, value: entry.value });
            });
            const valueInput = document.createElement("input");
            valueInput.type = "text";
            valueInput.className = "ib-skill-properties-value";
            valueInput.disabled = this.readOnly;
            valueInput.value = entry.value;
            valueInput.addEventListener("input", () => {
                this.setMapEntry(key, index, { key: entry.key, value: valueInput.value });
            });
            row.append(keyInput, valueInput);
            block.append(row);
        });
        return block;
    }

    private addRow(suggestions: readonly string[]): HTMLElement {
        const row = document.createElement("div");
        row.className = "ib-skill-properties-add";
        if (this.readOnly) {
            return row;
        }
        if (!this.addOpen) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "ib-skill-properties-add-button";
            button.textContent = "+ Add property";
            button.addEventListener("click", () => {
                this.addOpen = true;
                this.addPrefix = "";
                this.suggestionIndex = 0;
                this.render();
            });
            row.append(button);
            return row;
        }
        const input = document.createElement("input");
        input.type = "text";
        input.className = "ib-skill-properties-add-input";
        input.placeholder = "Property name";
        input.value = this.addPrefix;
        input.addEventListener("input", () => {
            this.addPrefix = input.value;
            this.suggestionIndex = 0;
            this.render();
        });
        row.append(input);
        if (suggestions.length > 0) {
            const list = document.createElement("ul");
            list.className = "ib-skill-properties-suggestions";
            suggestions.forEach((name, index) => {
                const item = document.createElement("li");
                item.className = "ib-skill-properties-suggestion";
                if (index === this.suggestionIndex) {
                    item.classList.add("ib-skill-properties-suggestion-active");
                }
                item.textContent = name;
                item.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    this.commitAdd(name);
                });
                list.append(item);
            });
            row.append(list);
        }
        return row;
    }

    private suggestions(): string[] {
        return completeAgentPropertyKeys(this.properties.map((property) => property.key), this.addPrefix);
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.addOpen) {
            return;
        }
        const options = this.suggestions();
        if (event.key === "Escape") {
            event.preventDefault();
            this.addOpen = false;
            this.addPrefix = "";
            this.render();
            return;
        }
        if (event.key === "ArrowDown" && options.length > 0) {
            event.preventDefault();
            this.suggestionIndex = (this.suggestionIndex + 1) % options.length;
            this.render();
            return;
        }
        if (event.key === "ArrowUp" && options.length > 0) {
            event.preventDefault();
            this.suggestionIndex = (this.suggestionIndex - 1 + options.length) % options.length;
            this.render();
            return;
        }
        if ((event.key === "Enter" || event.key === "Tab") && options.length > 0) {
            event.preventDefault();
            const key = options[this.suggestionIndex] ?? options[0];
            if (key) {
                this.commitAdd(key);
            }
        }
    }

    private commitAdd(key: string): void {
        this.addOpen = false;
        this.addPrefix = "";
        this.suggestionIndex = 0;
        this.properties = [...this.properties, emptyProperty(key)];
        this.render();
        this.write();
    }

    private setProperty(next: SkillProperty): void {
        this.properties = this.properties.map((property) => property.key === next.key ? next : property);
        this.write();
    }

    private setMapEntry(mapKey: string, index: number, entry: SkillMapEntry): void {
        this.properties = this.properties.map((property) => {
            if (property.key !== mapKey || property.kind !== "map") {
                return property;
            }
            const entries = property.entries.slice();
            entries[index] = entry;
            return { key: property.key, kind: "map", entries };
        });
        this.write();
    }

    private write(): void {
        const next = serializeSkillFrontMatter(this.properties);
        if (next === this.yaml) {
            return;
        }
        this.yaml = next;
        this.onYaml(next);
    }
}
