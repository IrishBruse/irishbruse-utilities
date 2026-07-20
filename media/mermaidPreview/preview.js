// @ts-check
(function () {
    const vscode = acquireVsCodeApi();

    /** @type {HTMLElement} */
    const viewport = document.getElementById("viewport");
    /** @type {HTMLElement} */
    const canvas = document.getElementById("canvas");
    /** @type {HTMLElement} */
    const diagram = document.getElementById("diagram");
    /** @type {HTMLElement} */
    const errorEl = document.getElementById("error");
    /** @type {HTMLElement} */
    const errorMessageEl = document.getElementById("error-message");
    /** @type {HTMLButtonElement} */
    const errorDismissBtn = document.getElementById("error-dismiss");
    /** @type {HTMLButtonElement} */
    const zoomOutBtn = document.getElementById("zoom-out");
    /** @type {HTMLButtonElement} */
    const zoomFitBtn = document.getElementById("zoom-fit");
    /** @type {HTMLButtonElement} */
    const zoomInBtn = document.getElementById("zoom-in");
    /** @type {HTMLButtonElement} */
    const copyPngBtn = document.getElementById("copy-png");

    let scale = 1;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panOriginX = 0;
    let panOriginY = 0;
    let currentSource = "";
    let renderId = 0;

    const FIT_MARGIN = 48;
    const PNG_EXPORT_MIN_SCALE = 2;
    const PNG_EXPORT_MAX_DIMENSION = 8192;

    /**
     * @param {number} width
     * @param {number} height
     * @returns {number}
     */
    function getPngExportScale(width, height) {
        const baseScale = Math.max(window.devicePixelRatio || 1, PNG_EXPORT_MIN_SCALE);
        const maxDimension = Math.max(width, height);
        if (maxDimension * baseScale > PNG_EXPORT_MAX_DIMENSION) {
            return PNG_EXPORT_MAX_DIMENSION / maxDimension;
        }
        return baseScale;
    }

    function applyTransform() {
        canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }

    function setCopyEnabled(enabled) {
        copyPngBtn.disabled = !enabled;
    }

    function zoomAt(factor) {
        const viewWidth = viewport.clientWidth;
        const viewHeight = viewport.clientHeight;
        const centerX = viewWidth / 2;
        const centerY = viewHeight / 2;
        const nextScale = scale * factor;

        panX = centerX - ((centerX - panX) * nextScale) / scale;
        panY = centerY - ((centerY - panY) * nextScale) / scale;
        scale = nextScale;
        applyTransform();
    }

    /**
     * @param {SVGSVGElement} svg
     * @returns {Promise<Uint8Array>}
     */
    function svgToPngBytes(svg) {
        const clone = /** @type {SVGSVGElement} */ (svg.cloneNode(true));
        const viewBox = clone.viewBox?.baseVal;
        const width = viewBox?.width || clone.width.baseVal.value || svg.getBoundingClientRect().width;
        const height = viewBox?.height || clone.height.baseVal.value || svg.getBoundingClientRect().height;

        clone.setAttribute("width", String(width));
        clone.setAttribute("height", String(height));

        const svgString = new XMLSerializer().serializeToString(clone);
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                const exportScale = getPngExportScale(width, height);
                const outputWidth = Math.ceil(width * exportScale);
                const outputHeight = Math.ceil(height * exportScale);
                const canvas = document.createElement("canvas");
                canvas.width = outputWidth;
                canvas.height = outputHeight;
                const context = canvas.getContext("2d");
                if (!context) {
                    reject(new Error("Could not create canvas context"));
                    return;
                }

                context.imageSmoothingEnabled = true;
                context.imageSmoothingQuality = "high";
                context.fillStyle = getComputedStyle(document.body).backgroundColor;
                context.fillRect(0, 0, outputWidth, outputHeight);
                context.drawImage(image, 0, 0, outputWidth, outputHeight);

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error("Could not create PNG"));
                        return;
                    }
                    blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))).catch(reject);
                }, "image/png");
            };
            image.onerror = () => reject(new Error("Could not load diagram image"));
            image.src = dataUrl;
        });
    }

    async function copyPng() {
        const svg = diagram.querySelector("svg");
        if (!svg) {
            return;
        }

        try {
            const bytes = await svgToPngBytes(svg);
            const blob = new Blob([bytes], { type: "image/png" });
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch (err) {
            showError(err instanceof Error ? err.message : String(err));
        }
    }

    /**
     * Mermaid emits width="100%" which makes layout depend on the parent and
     * breaks fit-to-view measurements after live source updates.
     * @param {SVGSVGElement} svg
     */
    function stabilizeSvgSize(svg) {
        const viewBox = svg.viewBox?.baseVal;
        const width = viewBox?.width || svg.width?.baseVal?.value;
        const height = viewBox?.height || svg.height?.baseVal?.value;
        if (!width || !height) {
            return;
        }

        svg.setAttribute("width", String(width));
        svg.setAttribute("height", String(height));
        svg.style.width = `${width}px`;
        svg.style.height = `${height}px`;
        svg.style.maxWidth = "none";
    }

    function scheduleFitToView() {
        requestAnimationFrame(() => {
            fitToView();
            if (diagram.querySelector("svg") && canvas.offsetWidth === 0) {
                requestAnimationFrame(() => fitToView());
            }
        });
    }

    function initializeMermaid() {
        const tokens = window.IbMermaidVsCodeTheme.getTokens();
        window.IbMermaidVsCodeTheme.applyDiagramTokens(diagram);
        mermaid.initialize({
            startOnLoad: false,
            theme: "base",
            themeVariables: window.IbMermaidVsCodeTheme.getThemeVariables(tokens),
            themeCSS: window.IbMermaidVsCodeTheme.getThemeCSS(tokens),
            securityLevel: "strict",
            suppressErrorRendering: true,
            logLevel: "fatal",
            gantt: {
                fontSize: 11,
                sectionFontSize: 11,
                barHeight: 22,
            },
        });
    }

    /**
     * @param {SVGSVGElement | null | undefined} svg
     * @returns {boolean}
     */
    function isMermaidErrorSvg(svg) {
        if (!svg) {
            return false;
        }
        return svg.querySelector(".error-icon, .error-text") !== null;
    }

    /**
     * @param {string} message
     * @returns {string}
     */
    function formatErrorMessage(message) {
        const trimmed = message.trim();
        const withoutVersion = trimmed.replace(/\s*mermaid version\s+[\d.]+/gi, "").trim();
        return withoutVersion || "Syntax error in diagram";
    }

    function showError(message) {
        errorMessageEl.textContent = formatErrorMessage(message);
        errorEl.hidden = false;
    }

    function clearError() {
        errorMessageEl.textContent = "";
        errorEl.hidden = true;
    }

    function fitToView() {
        const svg = diagram.querySelector("svg");
        if (!svg) {
            return;
        }

        const viewWidth = viewport.clientWidth;
        const viewHeight = viewport.clientHeight;

        scale = 1;
        panX = 0;
        panY = 0;
        applyTransform();

        const contentWidth = canvas.offsetWidth;
        const contentHeight = canvas.offsetHeight;
        if (contentWidth === 0 || contentHeight === 0) {
            return;
        }

        const scaleX = (viewWidth - FIT_MARGIN * 2) / contentWidth;
        const scaleY = (viewHeight - FIT_MARGIN * 2) / contentHeight;
        scale = Math.min(scaleX, scaleY);

        panX = (viewWidth - contentWidth * scale) / 2;
        panY = (viewHeight - contentHeight * scale) / 2;
        applyTransform();
    }

    async function renderDiagram(source) {
        currentSource = source;
        const id = ++renderId;
        clearError();

        if (!source.trim()) {
            diagram.replaceChildren();
            scale = 1;
            panX = 0;
            panY = 0;
            applyTransform();
            setCopyEnabled(false);
            return;
        }

        try {
            const { svg } = await mermaid.render(`mermaid-${id}`, source);
            if (id !== renderId) {
                return;
            }
            diagram.innerHTML = svg;
            const renderedSvg = diagram.querySelector("svg");
            if (isMermaidErrorSvg(renderedSvg)) {
                diagram.replaceChildren();
                setCopyEnabled(false);
                showError("Syntax error in diagram");
                return;
            }
            if (renderedSvg) {
                stabilizeSvgSize(renderedSvg);
            }
            setCopyEnabled(true);
            scheduleFitToView();
        } catch (err) {
            if (id !== renderId) {
                return;
            }
            diagram.replaceChildren();
            setCopyEnabled(false);
            showError(err instanceof Error ? err.message : String(err));
        }
    }

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.type) {
            case "update":
                void renderDiagram(message.source ?? "");
                break;
            case "theme":
                initializeMermaid();
                if (currentSource.trim()) {
                    void renderDiagram(currentSource);
                }
                break;
        }
    });

    viewport.addEventListener(
        "wheel",
        (event) => {
            event.preventDefault();
            const delta = event.deltaY > 0 ? 0.9 : 1.1;
            const nextScale = scale * delta;

            const rect = viewport.getBoundingClientRect();
            const cursorX = event.clientX - rect.left;
            const cursorY = event.clientY - rect.top;

            panX = cursorX - ((cursorX - panX) * nextScale) / scale;
            panY = cursorY - ((cursorY - panY) * nextScale) / scale;
            scale = nextScale;
            applyTransform();
        },
        { passive: false }
    );

    viewport.addEventListener("dragstart", (event) => {
        event.preventDefault();
    });

    /**
     * @param {EventTarget | null} target
     * @returns {boolean}
     */
    function isOverSelectableText(target) {
        if (!(target instanceof Element)) {
            return false;
        }
        return target.closest("text, foreignObject") !== null;
    }

    /**
     * @param {number} button
     * @param {EventTarget | null} target
     * @returns {boolean}
     */
    function shouldStartPan(button, target) {
        if (button === 1) {
            return true;
        }
        return button === 0 && !isOverSelectableText(target);
    }

    viewport.addEventListener("pointerdown", (event) => {
        if (!shouldStartPan(event.button, event.target)) {
            return;
        }
        event.preventDefault();
        isPanning = true;
        panStartX = event.clientX;
        panStartY = event.clientY;
        panOriginX = panX;
        panOriginY = panY;
        canvas.classList.add("panning");
        viewport.setPointerCapture(event.pointerId);
    });

    viewport.addEventListener("pointermove", (event) => {
        if (!isPanning) {
            return;
        }
        event.preventDefault();
        panX = panOriginX + (event.clientX - panStartX);
        panY = panOriginY + (event.clientY - panStartY);
        applyTransform();
    });

    function endPan(event) {
        if (!isPanning) {
            return;
        }
        isPanning = false;
        canvas.classList.remove("panning");
        if (event.pointerId !== undefined) {
            viewport.releasePointerCapture(event.pointerId);
        }
    }

    viewport.addEventListener("pointerup", endPan);
    viewport.addEventListener("pointercancel", endPan);

    viewport.addEventListener("auxclick", (event) => {
        if (event.button === 1) {
            event.preventDefault();
        }
    });

    window.addEventListener("resize", () => {
        if (diagram.querySelector("svg")) {
            fitToView();
        }
    });

    const toolbar = document.getElementById("toolbar");
    toolbar.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    zoomOutBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        zoomAt(0.9);
    });

    zoomFitBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        fitToView();
    });

    zoomInBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        zoomAt(1.1);
    });

    copyPngBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        void copyPng();
    });

    errorDismissBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        clearError();
    });

    initializeMermaid();
    vscode.postMessage({ type: "ready" });
})();
