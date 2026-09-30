import { EditorState, Facet, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { resolveImageUrl } from "./imageUrl";
import { parseScopes } from "./scopes";
import type { CursorContext, Scope, TextRange } from "./types";
import { markerVisibility, showsFormattedContent } from "./visibility";

export const documentUrlFacet = Facet.define<string, string>({
    combine(values) {
        return values.at(-1) ?? "";
    },
});

class BulletWidget extends WidgetType {
    eq(other: WidgetType): boolean {
        return other instanceof BulletWidget;
    }

    toDOM(): HTMLElement {
        const bullet = document.createElement("span");
        bullet.className = "inline-md-bullet";
        bullet.textContent = "•";
        return bullet;
    }
}

class TaskWidget extends WidgetType {
    constructor(
        private readonly checked: boolean,
        private readonly from: number,
        private readonly to: number,
    ) {
        super();
    }

    eq(other: WidgetType): boolean {
        return other instanceof TaskWidget
            && other.checked === this.checked
            && other.from === this.from
            && other.to === this.to;
    }

    toDOM(): HTMLElement {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "inline-md-task";
        input.checked = this.checked;
        input.dataset.from = String(this.from);
        input.dataset.to = String(this.to);
        return input;
    }
}

class RuleWidget extends WidgetType {
    eq(other: WidgetType): boolean {
        return other instanceof RuleWidget;
    }

    toDOM(): HTMLElement {
        const rule = document.createElement("hr");
        rule.className = "inline-md-hr";
        return rule;
    }
}

class LanguageWidget extends WidgetType {
    constructor(private readonly language: string) {
        super();
    }

    eq(other: WidgetType): boolean {
        return other instanceof LanguageWidget && other.language === this.language;
    }

    toDOM(): HTMLElement {
        const badge = document.createElement("span");
        badge.className = "inline-md-lang";
        badge.textContent = this.language;
        return badge;
    }
}

function imageLabel(alt: string): string {
    if (alt.length > 0) {
        return alt;
    }
    return "Image";
}

function fallbackElement(alt: string, from: number): HTMLSpanElement {
    const fallback = document.createElement("span");
    fallback.className = "inline-md-image-fallback";
    fallback.textContent = imageLabel(alt);
    fallback.dataset.from = String(from);
    return fallback;
}

class ImageFallbackWidget extends WidgetType {
    constructor(
        private readonly alt: string,
        private readonly from: number,
    ) {
        super();
    }

    eq(other: WidgetType): boolean {
        return other instanceof ImageFallbackWidget && other.alt === this.alt && other.from === this.from;
    }

    toDOM(): HTMLElement {
        return fallbackElement(this.alt, this.from);
    }
}

class ImageWidget extends WidgetType {
    constructor(
        private readonly src: string,
        private readonly alt: string,
        private readonly from: number,
    ) {
        super();
    }

    eq(other: WidgetType): boolean {
        return other instanceof ImageWidget
            && other.src === this.src
            && other.alt === this.alt
            && other.from === this.from;
    }

    toDOM(): HTMLElement {
        const frame = document.createElement("span");
        const image = document.createElement("img");
        image.className = "inline-md-image";
        image.alt = this.alt;
        image.dataset.from = String(this.from);
        image.addEventListener("error", () => {
            image.replaceWith(fallbackElement(this.alt, this.from));
        });
        image.src = this.src;
        frame.append(image);
        return frame;
    }
}

function cursorContext(state: EditorState): CursorContext {
    const selection = state.selection.main;
    const line = state.doc.lineAt(selection.head);
    return {
        selectionFrom: selection.from,
        selectionTo: selection.to,
        lineStart: line.from,
        lineEnd: line.to,
    };
}

function spansOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
    return start < otherEnd && end > otherStart;
}

function withoutTrailingLineBreak(state: EditorState, from: number, to: number): TextRange {
    let end = to;
    if (end > from && state.doc.sliceString(end - 1, end) === "\n") {
        end -= 1;
        if (end > from && state.doc.sliceString(end - 1, end) === "\r") {
            end -= 1;
        }
    }
    return { start: from, end };
}

function subtractRanges(start: number, end: number, cuts: readonly TextRange[]): TextRange[] {
    let segments: TextRange[] = [{ start, end }];
    for (const cut of cuts) {
        const next: TextRange[] = [];
        for (const segment of segments) {
            if (!spansOverlap(segment.start, segment.end, cut.start, cut.end)) {
                next.push(segment);
                continue;
            }
            if (cut.start > segment.start) {
                next.push({ start: segment.start, end: cut.start });
            }
            if (cut.end < segment.end) {
                next.push({ start: cut.end, end: segment.end });
            }
        }
        segments = next;
    }
    return segments.filter((segment) => segment.end > segment.start);
}

function contentClass(scope: Scope): string | undefined {
    switch (scope.kind) {
        case "heading": {
            const raw = scope.level ?? 1;
            const level = raw >= 1 && raw <= 6 ? Math.trunc(raw) : 1;
            return `inline-md-h${level}`;
        }
        case "strong":
            return "inline-md-strong";
        case "emphasis":
            return "inline-md-em";
        case "strikethrough":
            return "inline-md-strike";
        case "inlineCode":
            return "inline-md-code";
        case "link":
            return "inline-md-link";
        default:
            return undefined;
    }
}

function markerDecoration(scope: Scope, marker: TextRange, index: number, documentUrl: string): Decoration {
    switch (scope.kind) {
        case "listMarker":
            return Decoration.replace({ widget: new BulletWidget() });
        case "task":
            return Decoration.replace({
                widget: new TaskWidget(scope.checked === true, marker.start, marker.end),
            });
        case "image": {
            const alt = scope.alt ?? "";
            const src = scope.url ? resolveImageUrl(scope.url, documentUrl) : undefined;
            const widget = src ? new ImageWidget(src, alt, marker.start) : new ImageFallbackWidget(alt, marker.start);
            return Decoration.replace({ widget });
        }
        case "thematicBreak":
            return Decoration.replace({ widget: new RuleWidget() });
        case "codeBlock": {
            if (index === 0) {
                const language = scope.language && scope.language.length > 0 ? scope.language : "text";
                return Decoration.replace({ widget: new LanguageWidget(language) });
            }
            return Decoration.replace({});
        }
        default:
            return Decoration.replace({});
    }
}

function lineClass(scope: Scope): string | undefined {
    if (scope.kind === "blockquote") {
        return "inline-md-quote";
    }
    if (scope.kind === "codeBlock") {
        return "inline-md-code-line";
    }
    return undefined;
}

function addLineDecorations(state: EditorState, scope: Scope, ranges: Range<Decoration>[]): void {
    const className = lineClass(scope);
    if (!className || scope.end <= scope.start) {
        return;
    }
    const decoration = Decoration.line({ class: className });
    const doc = state.doc;
    let line = doc.lineAt(Math.min(scope.start, doc.length));
    for (;;) {
        const lineEnd = line.number < doc.lines ? line.to + 1 : line.to;
        if (scope.start < lineEnd && scope.end > line.from) {
            ranges.push(decoration.range(line.from));
        }
        if (line.number >= doc.lines || scope.end <= line.to + 1) {
            return;
        }
        line = doc.lineAt(line.to + 1);
    }
}

function buildDecorations(state: EditorState): DecorationSet {
    const cursor = cursorContext(state);
    const documentUrl = state.facet(documentUrlFacet);
    const scopes = parseScopes(state.doc.toString());
    const ranges: Range<Decoration>[] = [];
    const replaced: TextRange[] = [];

    const addHidden = (scope: Scope): void => {
        for (let index = 0; index < scope.markers.length; index += 1) {
            const marker = scope.markers[index];
            if (!marker || marker.end <= marker.start) {
                continue;
            }
            if (markerVisibility(scope, marker, cursor) !== "hidden") {
                continue;
            }
            const bounds = withoutTrailingLineBreak(state, marker.start, marker.end);
            if (bounds.end <= bounds.start || bounds.start < 0 || bounds.end > state.doc.length) {
                continue;
            }
            if (replaced.some((range) => spansOverlap(bounds.start, bounds.end, range.start, range.end))) {
                continue;
            }
            replaced.push(bounds);
            ranges.push(markerDecoration(scope, marker, index, documentUrl).range(bounds.start, bounds.end));
        }
    };

    for (const scope of scopes) {
        if (scope.kind === "image" || scope.kind === "thematicBreak") {
            addHidden(scope);
        }
    }
    for (const scope of scopes) {
        if (scope.kind !== "image" && scope.kind !== "thematicBreak") {
            addHidden(scope);
        }
    }

    for (const scope of scopes) {
        const className = contentClass(scope);
        if (className && showsFormattedContent(scope, cursor)) {
            const mark = Decoration.mark({ class: className });
            for (const segment of subtractRanges(scope.contentStart, scope.contentEnd, replaced)) {
                ranges.push(mark.range(segment.start, segment.end));
            }
        }
        for (const marker of scope.markers) {
            if (markerVisibility(scope, marker, cursor) !== "ghost") {
                continue;
            }
            const ghost = Decoration.mark({ class: "inline-md-ghost" });
            for (const segment of subtractRanges(marker.start, marker.end, replaced)) {
                ranges.push(ghost.range(segment.start, segment.end));
            }
        }
        addLineDecorations(state, scope, ranges);
    }

    ranges.sort((left, right) => {
        return left.from - right.from
            || left.value.startSide - right.value.startSide
            || left.to - right.to
            || left.value.endSide - right.value.endSide;
    });
    return Decoration.set(ranges, true);
}

const inlineDecorationField = StateField.define<DecorationSet>({
    create(state) {
        return buildDecorations(state);
    },
    update(value, transaction) {
        if (transaction.docChanged || transaction.selection) {
            return buildDecorations(transaction.state);
        }
        return value;
    },
    provide(field) {
        return EditorView.decorations.from(field);
    },
});

export const inlineDecorations = inlineDecorationField;
