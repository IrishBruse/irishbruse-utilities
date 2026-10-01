export const dragSelectionClassName = "inline-md-dragging";

export function bindDragSelection(root: HTMLElement): () => void {
    let dragging = false;

    const clear = (): void => {
        if (!dragging) {
            return;
        }
        dragging = false;
        root.classList.remove(dragSelectionClassName);
    };

    const onMouseDown = (event: MouseEvent): void => {
        if (event.button !== 0) {
            return;
        }
        dragging = false;
        root.classList.remove(dragSelectionClassName);
    };

    const onMouseMove = (event: MouseEvent): void => {
        if ((event.buttons & 1) === 0) {
            clear();
            return;
        }
        if (dragging) {
            return;
        }
        dragging = true;
        root.classList.add(dragSelectionClassName);
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
