export function createRuleZoneBody(
    end: number,
    onReveal: (offset: number) => void,
): HTMLDivElement {
    const frame = document.createElement("div");
    frame.className = "inline-md-hr-line";
    const rule = document.createElement("hr");
    rule.className = "inline-md-hr";
    frame.append(rule);
    frame.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onReveal(end);
    });
    return frame;
}
