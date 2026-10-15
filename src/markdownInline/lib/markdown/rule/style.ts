const CLICK_SLOP_PX = 4;

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
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startY = event.clientY;
        let dragged = false;
        const below = document.elementFromPoint(startX, startY);
        if (below) {
            below.dispatchEvent(
                new MouseEvent("mousedown", {
                    bubbles: true,
                    cancelable: true,
                    clientX: startX,
                    clientY: startY,
                    screenX: event.screenX,
                    screenY: event.screenY,
                    button: event.button,
                    buttons: 1,
                    ctrlKey: event.ctrlKey,
                    shiftKey: event.shiftKey,
                    altKey: event.altKey,
                    metaKey: event.metaKey,
                }),
            );
        }
        const onMove = (moveEvent: MouseEvent): void => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (dx * dx + dy * dy > CLICK_SLOP_PX * CLICK_SLOP_PX) {
                dragged = true;
            }
        };
        const onUp = (): void => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            if (!dragged) {
                onReveal(end);
            }
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    });
    return frame;
}
