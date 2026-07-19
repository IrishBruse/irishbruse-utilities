const vscode = acquireVsCodeApi();

const locationEl = document.getElementById("location");
const noteEl = document.getElementById("note");
const saveBtn = document.getElementById("save");
const cancelBtn = document.getElementById("cancel");

function applyState(state) {
    locationEl.textContent = state.location ?? "";
    noteEl.value = state.body ?? "";
    noteEl.disabled = Boolean(state.readOnly);
    saveBtn.hidden = Boolean(state.readOnly);
    cancelBtn.textContent = state.readOnly ? "Close" : "Cancel";
    if (!state.readOnly) {
        noteEl.focus();
        noteEl.setSelectionRange(noteEl.value.length, noteEl.value.length);
    }
}

window.addEventListener("message", (event) => {
    const message = event.data;
    if (message?.type === "init") {
        applyState(message);
    }
});

function save() {
    vscode.postMessage({ type: "save", body: noteEl.value });
}

function cancel() {
    vscode.postMessage({ type: "cancel" });
}

saveBtn.addEventListener("click", save);
cancelBtn.addEventListener("click", cancel);

noteEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (!noteEl.disabled) {
            save();
        }
    }
    if (event.key === "Escape") {
        event.preventDefault();
        cancel();
    }
});

vscode.postMessage({ type: "ready" });
