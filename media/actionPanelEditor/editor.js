const vscode = acquireVsCodeApi();

const templateEl = document.getElementById("template");
const labelEl = document.getElementById("label");
const typeEl = document.getElementById("type");
const iconSearchEl = document.getElementById("icon-search");
const iconPreviewEl = document.getElementById("icon-preview");
const iconClearEl = document.getElementById("icon-clear");
const iconListEl = document.getElementById("icon-list");
const iconPickerEl = document.getElementById("icon-picker");
const promptEl = document.getElementById("prompt");
const commandEl = document.getElementById("command");
const agentFieldsEl = document.getElementById("agent-fields");
const commandFieldsEl = document.getElementById("command-fields");
const errorEl = document.getElementById("error");
const saveBtn = document.getElementById("save");
const cancelBtn = document.getElementById("cancel");
const titleEl = document.getElementById("title");
const templateFieldEl = document.getElementById("template-field");

/** @type {Array<{ id: string; label: string; description?: string; draft: Record<string, string> }>} */
let templates = [];
/** @type {string[]} */
let codicons = [];
/** @type {string} */
let selectedIcon = "";
/** @type {number} */
let activeIconIndex = -1;
const maxIconResults = 80;

function clearError() {
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
}

function showError(message, field) {
    errorEl.textContent = message;
    errorEl.classList.add("visible");
    const target = field === "icon" ? iconSearchEl : field ? document.getElementById(field) : null;
    if (target) {
        target.focus();
    }
}

function updateTypeSections() {
    const isAgent = typeEl.value === "agent";
    agentFieldsEl.hidden = !isAgent;
    commandFieldsEl.hidden = isAgent;
}

function updateIconPreview(icon) {
    if (icon) {
        iconPreviewEl.className = `codicon codicon-${icon} icon-preview`;
    } else {
        iconPreviewEl.className = "icon-preview icon-preview-empty";
    }
}

function setIcon(icon, updateSearch = true) {
    selectedIcon = icon;
    if (updateSearch) {
        iconSearchEl.value = icon;
    }
    updateIconPreview(icon);
}

function filterIcons(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return codicons.slice(0, maxIconResults);
    }
    return codicons.filter((icon) => icon.includes(normalized)).slice(0, maxIconResults);
}

function renderIconList(query = iconSearchEl.value) {
    const matches = filterIcons(query);
    iconListEl.replaceChildren();
    activeIconIndex = -1;

    if (matches.length === 0) {
        const empty = document.createElement("div");
        empty.className = "icon-empty";
        empty.textContent = "No matching icons.";
        iconListEl.appendChild(empty);
        iconListEl.hidden = false;
        return;
    }

    for (const icon of matches) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "icon-option";
        button.dataset.icon = icon;
        button.innerHTML = `<span class="codicon codicon-${icon}" aria-hidden="true"></span><span>${icon}</span>`;
        button.addEventListener("mousedown", (event) => {
            event.preventDefault();
            selectIcon(icon);
        });
        iconListEl.appendChild(button);
    }

    iconListEl.hidden = false;
}

function openIconList() {
    renderIconList();
}

function closeIconList() {
    iconListEl.hidden = true;
    activeIconIndex = -1;
    updateActiveIconOption();
}

function updateActiveIconOption() {
    const options = [...iconListEl.querySelectorAll(".icon-option")];
    for (const [index, option] of options.entries()) {
        option.classList.toggle("active", index === activeIconIndex);
    }
    const active = options[activeIconIndex];
    if (active) {
        active.scrollIntoView({ block: "nearest" });
    }
}

function selectIcon(icon) {
    setIcon(icon);
    closeIconList();
    iconSearchEl.focus();
}

function applyDraft(draft) {
    labelEl.value = draft.label ?? "";
    typeEl.value = draft.type ?? "agent";
    setIcon(draft.icon ?? "");
    promptEl.value = draft.prompt ?? "";
    commandEl.value = draft.command ?? "";
    updateTypeSections();
}

function readValues() {
    return {
        label: labelEl.value,
        type: typeEl.value,
        icon: selectedIcon,
        prompt: promptEl.value,
        command: commandEl.value,
    };
}

function validateClient(values) {
    if (!values.label.trim()) {
        return { message: "Label is required.", field: "label" };
    }
    if (values.type === "agent" && !values.prompt.trim()) {
        return { message: "Prompt is required for agent actions.", field: "prompt" };
    }
    if (values.type === "command" && !values.command.trim()) {
        return { message: "Command is required for VS Code command actions.", field: "command" };
    }
    return undefined;
}

function populateTemplates(items) {
    templates = items;
    templateEl.replaceChildren();
    for (const template of items) {
        const option = document.createElement("option");
        option.value = template.id;
        option.textContent = template.label;
        if (template.description) {
            option.title = template.description;
        }
        templateEl.appendChild(option);
    }
}

function applyState(state) {
    const isEdit = state.mode === "edit";
    titleEl.textContent = isEdit ? "Edit Action" : "Add Action";
    saveBtn.textContent = isEdit ? "Save" : "Add";
    templateFieldEl.hidden = isEdit;

    populateTemplates(state.templates ?? []);
    codicons = state.codicons ?? [];
    templateEl.value = state.values?.templateId ?? "custom";
    applyDraft(state.values ?? {});
    clearError();
    labelEl.focus();
    labelEl.select();
}

window.addEventListener("message", (event) => {
    const message = event.data;
    if (message?.type === "init") {
        applyState(message);
        return;
    }
    if (message?.type === "error") {
        showError(message.message ?? "Unable to add action.", message.field);
    }
});

templateEl.addEventListener("change", () => {
    const template = templates.find((entry) => entry.id === templateEl.value);
    if (template) {
        applyDraft(template.draft ?? {});
        clearError();
    }
});

typeEl.addEventListener("change", () => {
    updateTypeSections();
    clearError();
});

iconSearchEl.addEventListener("focus", () => {
    openIconList();
});

iconSearchEl.addEventListener("input", () => {
    const query = iconSearchEl.value;
    const exact = codicons.find((icon) => icon === query);
    selectedIcon = exact ?? "";
    updateIconPreview(selectedIcon);
    renderIconList(query);
});

iconSearchEl.addEventListener("keydown", (event) => {
    const options = [...iconListEl.querySelectorAll(".icon-option")];
    if (event.key === "ArrowDown") {
        event.preventDefault();
        if (iconListEl.hidden) {
            openIconList();
            return;
        }
        activeIconIndex = Math.min(activeIconIndex + 1, options.length - 1);
        updateActiveIconOption();
        return;
    }
    if (event.key === "ArrowUp") {
        event.preventDefault();
        activeIconIndex = Math.max(activeIconIndex - 1, 0);
        updateActiveIconOption();
        return;
    }
    if (event.key === "Enter" && !iconListEl.hidden && activeIconIndex >= 0) {
        event.preventDefault();
        const active = options[activeIconIndex];
        if (active?.dataset.icon) {
            selectIcon(active.dataset.icon);
        }
        return;
    }
    if (event.key === "Escape" && !iconListEl.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeIconList();
    }
});

iconClearEl.addEventListener("click", () => {
    setIcon("");
    openIconList();
    iconSearchEl.focus();
});

document.addEventListener("click", (event) => {
    if (!iconPickerEl.contains(event.target)) {
        closeIconList();
        if (iconSearchEl.value && !selectedIcon) {
            const exact = codicons.find((icon) => icon === iconSearchEl.value.trim());
            if (exact) {
                setIcon(exact, false);
            } else {
                iconSearchEl.value = selectedIcon;
            }
        } else {
            iconSearchEl.value = selectedIcon;
        }
    }
});

function save() {
    closeIconList();
    clearError();
    const values = readValues();
    const validationError = validateClient(values);
    if (validationError) {
        showError(validationError.message, validationError.field);
        return;
    }

    vscode.postMessage({
        type: "save",
        templateId: templateEl.value,
        values,
    });
}

function cancel() {
    vscode.postMessage({ type: "cancel" });
}

saveBtn.addEventListener("click", save);
cancelBtn.addEventListener("click", cancel);

document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        save();
        return;
    }
    if (event.key === "Escape") {
        event.preventDefault();
        cancel();
    }
});

vscode.postMessage({ type: "ready" });
