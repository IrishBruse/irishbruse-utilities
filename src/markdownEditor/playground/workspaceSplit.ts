const SPLIT_WIDTH_PX = 10;
const MIN_PANE_PX = 160;
const STORAGE_KEY = "ib-utilities.markdownEditor.playground.split";

/** Draggable divider between the source inspector and preview editor. */
export function installWorkspaceSplit(workspace: HTMLElement, split: HTMLElement): void {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        workspace.style.setProperty("--workspace-source-width", saved);
    }

    let dragging = false;

    split.addEventListener("mousedown", (event) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        dragging = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    });

    window.addEventListener("mousemove", (event) => {
        if (!dragging) {
            return;
        }
        const rect = workspace.getBoundingClientRect();
        const max = rect.width - MIN_PANE_PX - SPLIT_WIDTH_PX;
        const width = Math.min(max, Math.max(MIN_PANE_PX, event.clientX - rect.left));
        workspace.style.setProperty("--workspace-source-width", `${width}px`);
    });

    window.addEventListener("mouseup", () => {
        if (!dragging) {
            return;
        }
        dragging = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        const width = workspace.style.getPropertyValue("--workspace-source-width").trim();
        if (width) {
            localStorage.setItem(STORAGE_KEY, width);
        }
    });
}
