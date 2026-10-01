export const dragSelectionClassName = "inline-md-dragging";

let dragging = false;

export function isDragSelecting(): boolean {
    return dragging;
}

export function bindDragSelection(root: HTMLElement, onDragEnd?: () => void): () => void {
    const clear = (): void => {
        if (!dragging) {
            return;
        }
        dragging = false;
        root.classList.remove(dragSelectionClassName);
        onDragEnd?.();
    };

    const onMouseDown = (event: MouseEvent): void => {
        if (event.button !== 0) {
            return;
        }
        dragging = true;
        root.classList.add(dragSelectionClassName);
    };

    const onMouseMove = (event: MouseEvent): void => {
        if ((event.buttons & 1) === 0) {
            clear();
        }
    };

    root.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", clear);
    window.addEventListener("blur", clear);

    return () => {
        root.removeEventListener("mousedown", onMouseDown, true);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", clear);
        window.removeEventListener("blur", clear);
        clear();
    };
}
