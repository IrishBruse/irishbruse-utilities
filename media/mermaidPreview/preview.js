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
    /** @type {HTMLElement} */
    const linkTooltipEl = document.getElementById("link-tooltip");

    let scale = 1;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panOriginX = 0;
    let panOriginY = 0;
    let currentSource = "";
    let hasRenderedDiagram = false;
    let renderId = 0;
    /** @type {Map<string, { href: string, tooltip: string }>} */
    let clickTargetMap = new Map();
    /** @type {{ openBeside: boolean }} */
    let lastLinkClick = { openBeside: false };
    let windowOpenHookInstalled = false;

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

    function installWindowOpenHook() {
        if (windowOpenHookInstalled) {
            return;
        }
        windowOpenHookInstalled = true;
        const nativeOpen = window.open.bind(window);
        window.open = (url, _target, _features) => {
            if (typeof url === "string" && url.trim()) {
                vscode.postMessage({
                    type: "openLink",
                    href: url,
                    openBeside: lastLinkClick.openBeside,
                });
                return null;
            }
            return nativeOpen(url, _target, _features);
        };
    }

    /**
     * @param {string} href
     * @param {string | undefined} tooltip
     * @param {boolean} openBeside
     */
    function postOpenLink(href, tooltip, openBeside) {
        vscode.postMessage({
            type: "openLink",
            href,
            tooltip,
            openBeside,
        });
    }

    const XLINK_NS = "http://www.w3.org/1999/xlink";
    const CLICK_HREF_LINE = /^\s*click\s+(\S+)\s+href\s+"([^"]*)"\s+"([^"]*)"\s*$/;
    const GBL_TOOLTIP_LOCATION_RE = /^(.+):(\d+):(\d+)$/;
    const GBL_PATH_LINE_ONLY_RE = /^(.+):(\d+)$/;
    const EXTERNAL_HREF_RE = /^(https?:|mailto:)/i;
    const LINK_TOOLTIP_OFFSET_PX = 14;

    /**
     * @param {Node | null | undefined} node
     * @returns {Element | null}
     */
    function parentElementNode(node) {
        const parent = node?.parentNode ?? null;
        return parent instanceof Element ? parent : null;
    }

    function normalizeGblRelativePath(relativePath) {
        const trimmed = relativePath.trim();
        if (!trimmed) {
            return trimmed;
        }
        return trimmed.replace(/^\.\//, "");
    }

    /**
     * @param {string} value
     * @returns {{ relativePath: string, line: number, column: number } | null}
     */
    function parseGblLocationString(value) {
        const trimmed = value.trim();
        if (!trimmed || EXTERNAL_HREF_RE.test(trimmed)) {
            return null;
        }
        const lineColumn = GBL_TOOLTIP_LOCATION_RE.exec(trimmed);
        if (lineColumn) {
            return {
                relativePath: normalizeGblRelativePath(lineColumn[1]),
                line: Number.parseInt(lineColumn[2], 10) || 1,
                column: Number.parseInt(lineColumn[3], 10) || 1,
            };
        }
        const lineOnly = GBL_PATH_LINE_ONLY_RE.exec(trimmed);
        if (lineOnly) {
            return {
                relativePath: normalizeGblRelativePath(lineOnly[1]),
                line: Number.parseInt(lineOnly[2], 10) || 1,
                column: 1,
            };
        }
        return null;
    }

    function normalizeGblClickPair(href, tooltip) {
        const trimmedHref = href.trim();
        const trimmedTooltip = tooltip?.trim() ?? "";
        const resolved =
            (trimmedTooltip ? parseGblLocationString(trimmedTooltip) : null) ??
            (trimmedHref ? parseGblLocationString(trimmedHref) : null) ??
            (trimmedHref ? resolveHrefWorkspaceLocation(trimmedHref) : null);
        if (resolved) {
            const canonical = `${resolved.relativePath}:${resolved.line}:${resolved.column}`;
            return { href: resolved.relativePath, tooltip: canonical };
        }
        return { href: trimmedHref, tooltip: trimmedTooltip || trimmedHref };
    }

    /**
     * @param {string} href
     * @returns {{ relativePath: string, line: number, column: number } | null}
     */
    function resolveHrefWorkspaceLocation(href) {
        const trimmedHref = href.trim();
        if (!trimmedHref || EXTERNAL_HREF_RE.test(trimmedHref)) {
            return null;
        }
        const hashIndex = trimmedHref.indexOf("#");
        const pathPart = (hashIndex === -1 ? trimmedHref : trimmedHref.slice(0, hashIndex)).trim();
        const fragment = hashIndex === -1 ? "" : trimmedHref.slice(hashIndex);

        if (fragment) {
            const vscodeMatch = /#L(\d+),(\d+)/i.exec(fragment);
            if (vscodeMatch && pathPart) {
                return {
                    relativePath: pathPart,
                    line: Number.parseInt(vscodeMatch[1], 10) || 1,
                    column: Number.parseInt(vscodeMatch[2], 10) || 1,
                };
            }
            const githubMatch = /#L(\d+)/i.exec(fragment);
            if (githubMatch && pathPart) {
                return {
                    relativePath: pathPart,
                    line: Number.parseInt(githubMatch[1], 10) || 1,
                    column: 1,
                };
            }
        }

        const suffixMatch = pathPart ? parseGblLocationString(pathPart) : null;
        if (suffixMatch) {
            return suffixMatch;
        }

        if (!pathPart) {
            return null;
        }
        return { relativePath: normalizeGblRelativePath(pathPart), line: 1, column: 1 };
    }

    /**
     * @param {string} source
     */
    function rebuildClickTargetMap(source) {
        clickTargetMap = new Map();
        for (const line of source.split(/\r?\n/)) {
            const normalizedLine = line.trim().replace(/[\u201C\u201D]/g, '"');
            const match = CLICK_HREF_LINE.exec(normalizedLine);
            if (!match) {
                continue;
            }
            clickTargetMap.set(match[1], normalizeGblClickPair(match[2], match[3]));
        }
    }

    /**
     * @param {string} nodeId
     * @returns {{ href: string, tooltip: string } | undefined}
     */
    function getClickTargetEntry(nodeId) {
        const direct = clickTargetMap.get(nodeId);
        if (direct) {
            return direct;
        }
        const lower = nodeId.toLowerCase();
        for (const [key, value] of clickTargetMap) {
            if (key.toLowerCase() === lower) {
                return value;
            }
        }
        return undefined;
    }

    function cssEscapeIdent(value) {
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
            return CSS.escape(value);
        }
        return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function findMapKeyForNodeId(nodeId) {
        if (clickTargetMap.has(nodeId)) {
            return nodeId;
        }
        const lower = nodeId.toLowerCase();
        for (const key of clickTargetMap.keys()) {
            if (key.toLowerCase() === lower) {
                return key;
            }
        }
        return undefined;
    }

    function markLinkedFlowchartNodes() {
        for (const nodeGroup of diagram.querySelectorAll("g.node")) {
            nodeGroup.classList.remove("ib-diagram-link");
            nodeGroup.removeAttribute("data-ib-node-id");
        }

        for (const mapNodeId of clickTargetMap.keys()) {
            const escaped = cssEscapeIdent(mapNodeId);
            const selector = `g.node[data-id="${escaped}"], g.node[id*="flowchart-${escaped}-"]`;
            for (const nodeGroup of diagram.querySelectorAll(selector)) {
                nodeGroup.classList.add("ib-diagram-link");
                nodeGroup.setAttribute("data-ib-node-id", mapNodeId);
            }
        }

        for (const nodeGroup of diagram.querySelectorAll("g.node")) {
            if (nodeGroup.classList.contains("ib-diagram-link")) {
                continue;
            }
            const dataId = nodeGroup.getAttribute("data-id");
            const domId = nodeGroup.getAttribute("id") ?? "";
            const nodeId = dataId || resolveFlowchartNodeIdFromDomId(domId);
            const mapKey = nodeId ? findMapKeyForNodeId(nodeId) : undefined;
            if (mapKey) {
                nodeGroup.classList.add("ib-diagram-link");
                nodeGroup.setAttribute("data-ib-node-id", mapKey);
            }
        }
    }

    /** @type {Array<() => void>} */
    let linkedNodeHandlerDisposers = [];

    function attachLinkedNodeClickHandlers() {
        for (const dispose of linkedNodeHandlerDisposers) {
            dispose();
        }
        linkedNodeHandlerDisposers = [];

        for (const nodeGroup of diagram.querySelectorAll("g.ib-diagram-link")) {
            const nodesToWire = [nodeGroup];
            const parentAnchor = nodeGroup.parentElement;
            if (
                parentAnchor instanceof Element &&
                (parentAnchor.localName === "a" || parentAnchor.tagName === "A")
            ) {
                nodesToWire.push(parentAnchor);
            }

            for (const el of nodesToWire) {
            /**
             * @param {MouseEvent | PointerEvent} event
             */
            const openFromNode = (event) => {
                if ("button" in event && event.button !== 0) {
                    return;
                }
                const entry = lookupNodeClickTarget(nodeGroup);
                if (!entry) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                lastLinkClick.openBeside = event.ctrlKey || event.metaKey;
                activateDiagramLink(entry, lastLinkClick.openBeside);
            };

            el.addEventListener("click", openFromNode);
            linkedNodeHandlerDisposers.push(() => {
                el.removeEventListener("click", openFromNode);
            });
            }
        }
    }

    function unwrapMermaidNodeAnchors() {
        for (const nodeGroup of diagram.querySelectorAll("g.ib-diagram-link")) {
            // Mermaid wraps nodes in <a transform="translate(...)">; do not hoist the node out of
            // that anchor or the diagram loses positioning. Only unwrap nested <a> inside the node.
            for (const anchor of [...nodeGroup.querySelectorAll("a")]) {
                const parent = anchor.parentNode;
                if (!parent) {
                    continue;
                }
                while (anchor.firstChild) {
                    parent.insertBefore(anchor.firstChild, anchor);
                }
                anchor.remove();
            }
        }
    }

    /**
     * @param {PointerEvent} event
     * @returns {SVGElement | Element | null}
     */
    function pointerHitLinkedNode(event) {
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        if (!(hit instanceof Element)) {
            return null;
        }
        const linked = hit.closest("g.ib-diagram-link");
        if (linked instanceof Element && diagram.contains(linked)) {
            return linked;
        }
        const wrapAnchor = hit.closest("a");
        if (wrapAnchor instanceof Element && diagram.contains(wrapAnchor)) {
            const inner = wrapAnchor.querySelector("g.ib-diagram-link");
            if (inner instanceof Element) {
                return inner;
            }
        }
        return null;
    }

    /**
     * @param {PointerEvent} event
     * @returns {EventTarget | null}
     */
    function pointerEventDiagramTarget(event) {
        const raw = event.target;
        if (raw instanceof Element && raw !== viewport && raw !== canvas && diagram.contains(raw)) {
            return raw;
        }
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        if (hit instanceof Element && diagram.contains(hit)) {
            return hit;
        }
        return raw;
    }

    /**
     * @param {string} domId
     * @returns {string}
     */
    function resolveFlowchartNodeIdFromDomId(domId) {
        const trimmed = domId.trim();
        if (!trimmed) {
            return "";
        }
        const flowchartMatch = /flowchart-(.+)-\d+$/i.exec(trimmed);
        if (flowchartMatch) {
            return flowchartMatch[1];
        }
        return trimmed;
    }

    /**
     * @param {EventTarget | null} target
     * @returns {Element | null}
     */
    function findFlowchartNodeGroup(target) {
        let el = target instanceof Element ? target : parentElementNode(target instanceof Node ? target : null);
        while (el && el !== diagram) {
            if (el.classList.contains("node")) {
                return el;
            }
            el = parentElementNode(el);
        }
        return null;
    }

    /**
     * @param {string} href
     * @returns {boolean}
     */
    function isUsableDiagramHref(href) {
        const trimmed = href.trim();
        if (!trimmed || trimmed === "#") {
            return false;
        }
        return !/^javascript:/i.test(trimmed);
    }

    /**
     * @param {Element} nodeGroup
     * @returns {{ href: string, tooltip: string | undefined } | null}
     */
    function lookupNodeClickTarget(nodeGroup) {
        const ibNodeId = nodeGroup.getAttribute("data-ib-node-id");
        if (ibNodeId) {
            const fromIb = getClickTargetEntry(ibNodeId);
            if (fromIb) {
                return { href: fromIb.href, tooltip: fromIb.tooltip };
            }
        }

        const dataId = nodeGroup.getAttribute("data-id");
        const domId = nodeGroup.getAttribute("id") ?? "";
        const nodeId = dataId || resolveFlowchartNodeIdFromDomId(domId);
        if (!nodeId) {
            return null;
        }
        const entry = getClickTargetEntry(nodeId);
        if (!entry) {
            return null;
        }
        return { href: entry.href, tooltip: entry.tooltip };
    }

    /**
     * @param {EventTarget | null} target
     * @returns {{ href: string, tooltip: string | undefined } | null}
     */
    function resolveClickLinkFromTarget(target) {
        const nodeGroup = findFlowchartNodeGroup(target);
        if (nodeGroup) {
            const fromMap = lookupNodeClickTarget(nodeGroup);
            if (fromMap) {
                return fromMap;
            }
        }

        const anchor = findClickableLinkElement(target);
        if (anchor) {
            return getAnchorLink(anchor);
        }

        return null;
    }

    /**
     * @param {EventTarget | null} target
     * @returns {boolean}
     */
    function isInteractiveDiagramTarget(target) {
        return resolveClickLinkFromTarget(target) !== null;
    }

    /**
     * @param {EventTarget | null} target
     * @returns {Element | null}
     */
    function findClickableLinkElement(target) {
        let el = target instanceof Element ? target : parentElementNode(target instanceof Node ? target : null);
        while (el && el !== diagram) {
            const tag = el.localName ?? el.tagName;
            if (tag === "a") {
                const href = el.getAttribute("href") ?? el.getAttributeNS(XLINK_NS, "href");
                if (href && isUsableDiagramHref(href)) {
                    return el;
                }
            }
            el = parentElementNode(el);
        }
        return null;
    }

    /**
     * @param {Element} anchor
     * @returns {{ href: string, tooltip: string | undefined }}
     */
    function getAnchorLink(anchor) {
        const href = anchor.getAttribute("href") ?? anchor.getAttributeNS(XLINK_NS, "href") ?? "";
        const tooltip =
            anchor.getAttribute("data-ib-tooltip") ?? anchor.getAttribute("title") ?? undefined;
        return { href, tooltip };
    }

    /**
     * @param {string | undefined} tooltip
     * @param {string | undefined} href
     * @returns {string}
     */
    function formatLinkHoverText(tooltip, href) {
        const trimmedTooltip = tooltip?.trim();
        if (trimmedTooltip) {
            const match = GBL_TOOLTIP_LOCATION_RE.exec(trimmedTooltip);
            if (match) {
                const fileName = match[1].split(/[/\\]/).pop() || match[1];
                return `Open ${fileName} at line ${match[2]}, column ${match[3]}`;
            }
            const lineOnly = GBL_PATH_LINE_ONLY_RE.exec(trimmedTooltip);
            if (lineOnly) {
                const fileName = lineOnly[1].split(/[/\\]/).pop() || lineOnly[1];
                return `Open ${fileName} at line ${lineOnly[2]}`;
            }
            return trimmedTooltip;
        }

        const trimmedHref = href?.trim() ?? "";
        if (trimmedHref && EXTERNAL_HREF_RE.test(trimmedHref)) {
            return trimmedHref;
        }
        if (trimmedHref && isUsableDiagramHref(trimmedHref)) {
            const vscodeFrag = /#L(\d+),(\d+)/i.exec(trimmedHref);
            if (vscodeFrag) {
                const pathPart = trimmedHref.split("#")[0].split(/[/\\]/).pop() || trimmedHref;
                return `Open ${pathPart} at line ${vscodeFrag[1]}, column ${vscodeFrag[2]}`;
            }
            const hashMatch = /#L(\d+)/i.exec(trimmedHref);
            const pathPart = trimmedHref.split("#")[0].split(/[/\\]/).pop() || trimmedHref;
            if (hashMatch) {
                return `Open ${pathPart} at line ${hashMatch[1]}`;
            }
            return `Open ${pathPart}`;
        }
        return "";
    }

    /**
     * @param {ParentNode} root
     */
    function stripNativeDiagramTitles(root) {
        const titled = root.querySelectorAll("[title]");
        for (const el of titled) {
            const nativeTitle = el.getAttribute("title");
            if (nativeTitle && !el.hasAttribute("data-ib-tooltip")) {
                el.setAttribute("data-ib-tooltip", nativeTitle);
            }
            el.removeAttribute("title");
        }
    }

    function hideLinkTooltip() {
        if (!linkTooltipEl) {
            return;
        }
        linkTooltipEl.textContent = "";
        linkTooltipEl.hidden = true;
    }

    /**
     * @param {string} text
     * @param {number} clientX
     * @param {number} clientY
     */
    function showLinkTooltip(text, clientX, clientY) {
        if (!linkTooltipEl || !text) {
            hideLinkTooltip();
            return;
        }
        linkTooltipEl.textContent = text;
        linkTooltipEl.hidden = false;
        linkTooltipEl.style.left = "0px";
        linkTooltipEl.style.top = "0px";

        const margin = 8;
        const rect = linkTooltipEl.getBoundingClientRect();
        let left = clientX + LINK_TOOLTIP_OFFSET_PX;
        let top = clientY + LINK_TOOLTIP_OFFSET_PX;
        if (left + rect.width > window.innerWidth - margin) {
            left = Math.max(margin, clientX - rect.width - LINK_TOOLTIP_OFFSET_PX);
        }
        if (top + rect.height > window.innerHeight - margin) {
            top = Math.max(margin, clientY - rect.height - LINK_TOOLTIP_OFFSET_PX);
        }
        linkTooltipEl.style.left = `${left}px`;
        linkTooltipEl.style.top = `${top}px`;
    }

    function setupLinkTooltipHover() {
        diagram.addEventListener(
            "pointermove",
            (event) => {
                if (isPanning) {
                    hideLinkTooltip();
                    return;
                }
                const linked = pointerHitLinkedNode(event);
                const link = linked
                    ? lookupNodeClickTarget(linked)
                    : resolveClickLinkFromTarget(pointerEventDiagramTarget(event));
                if (!link) {
                    hideLinkTooltip();
                    return;
                }
                const label = formatLinkHoverText(link.tooltip, link.href);
                if (!label) {
                    hideLinkTooltip();
                    return;
                }
                showLinkTooltip(label, event.clientX, event.clientY);
            },
            true
        );

        diagram.addEventListener(
            "pointerleave",
            () => {
                hideLinkTooltip();
            },
            true
        );
    }

  /** @type {{ link: { href: string, tooltip: string | undefined }, x: number, y: number } | null} */
    let pendingDiagramLink = null;
    /** @type {{ link: { href: string, tooltip: string | undefined }, x: number, y: number } | null} */
    let activeLinkPress = null;
    const DIAGRAM_LINK_DRAG_THRESHOLD_PX = 6;

    let lastLinkActivationKey = "";
    let lastLinkActivationAt = 0;

    function activateDiagramLink(link, openBeside) {
        const key = `${link.href}\0${link.tooltip ?? ""}\0${openBeside}`;
        const now = Date.now();
        if (key === lastLinkActivationKey && now - lastLinkActivationAt < 400) {
            return;
        }
        lastLinkActivationKey = key;
        lastLinkActivationAt = now;
        postOpenLink(link.href, link.tooltip, openBeside);
    }

    function setupGlobalDiagramLinkActivation() {
        window.addEventListener(
            "pointerdown",
            (event) => {
                if (event.button !== 0) {
                    activeLinkPress = null;
                    return;
                }
                const node = pointerHitLinkedNode(event);
                if (!node) {
                    activeLinkPress = null;
                    return;
                }
                const entry = lookupNodeClickTarget(node);
                if (!entry) {
                    activeLinkPress = null;
                    return;
                }
                activeLinkPress = { link: entry, x: event.clientX, y: event.clientY };
            },
            true
        );

        window.addEventListener(
            "pointerup",
            (event) => {
                if (event.button !== 0 || !activeLinkPress) {
                    return;
                }
                const press = activeLinkPress;
                activeLinkPress = null;
                pendingDiagramLink = null;

                const dx = event.clientX - press.x;
                const dy = event.clientY - press.y;
                if (dx * dx + dy * dy > DIAGRAM_LINK_DRAG_THRESHOLD_PX * DIAGRAM_LINK_DRAG_THRESHOLD_PX) {
                    return;
                }

                lastLinkClick.openBeside = event.ctrlKey || event.metaKey;
                event.preventDefault();
                event.stopPropagation();
                activateDiagramLink(press.link, lastLinkClick.openBeside);
            },
            true
        );

        window.addEventListener(
            "pointercancel",
            () => {
                activeLinkPress = null;
                pendingDiagramLink = null;
            },
            true
        );
    }

    function setupDiagramClickDelegation() {
        diagram.addEventListener(
            "pointerdown",
            (event) => {
                if (event.button !== 0) {
                    pendingDiagramLink = null;
                    return;
                }
                const link = resolveClickLinkFromTarget(pointerEventDiagramTarget(event));
                pendingDiagramLink = link
                    ? { link, x: event.clientX, y: event.clientY }
                    : null;
            },
            true
        );

        diagram.addEventListener(
            "pointerup",
            (event) => {
                if (event.button !== 0 || !pendingDiagramLink) {
                    return;
                }
                const pending = pendingDiagramLink;
                pendingDiagramLink = null;

                const dx = event.clientX - pending.x;
                const dy = event.clientY - pending.y;
                if (dx * dx + dy * dy > DIAGRAM_LINK_DRAG_THRESHOLD_PX * DIAGRAM_LINK_DRAG_THRESHOLD_PX) {
                    return;
                }

                lastLinkClick.openBeside = event.ctrlKey || event.metaKey;
                event.preventDefault();
                event.stopPropagation();
                activateDiagramLink(pending.link, lastLinkClick.openBeside);
            },
            true
        );

        diagram.addEventListener(
            "pointercancel",
            () => {
                pendingDiagramLink = null;
            },
            true
        );

        diagram.addEventListener(
            "click",
            (event) => {
                const link = resolveClickLinkFromTarget(event.target);
                if (!link) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
            },
            true
        );
    }

    installWindowOpenHook();
    setupGlobalDiagramLinkActivation();
    setupDiagramClickDelegation();
    setupLinkTooltipHover();

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

    async function renderDiagram(source, options = {}) {
        const preserveViewport = options.preserveViewport === true;
        const sourceUnchanged = source === currentSource && hasRenderedDiagram;
        currentSource = source;
        rebuildClickTargetMap(source);
        const id = ++renderId;
        clearError();

        if (!source.trim()) {
            diagram.replaceChildren();
            hideLinkTooltip();
            for (const dispose of linkedNodeHandlerDisposers) {
                dispose();
            }
            linkedNodeHandlerDisposers = [];
            clickTargetMap = new Map();
            scale = 1;
            panX = 0;
            panY = 0;
            applyTransform();
            setCopyEnabled(false);
            hasRenderedDiagram = false;
            return;
        }

        try {
            const { svg, bindFunctions } = await mermaid.render(`mermaid-${id}`, source);
            if (id !== renderId) {
                return;
            }
            diagram.innerHTML = svg;
            bindFunctions?.(diagram);
            const renderedSvg = diagram.querySelector("svg");
            if (isMermaidErrorSvg(renderedSvg)) {
                diagram.replaceChildren();
                setCopyEnabled(false);
                showError("Syntax error in diagram");
                return;
            }
            if (renderedSvg) {
                stabilizeSvgSize(renderedSvg);
                stripNativeDiagramTitles(renderedSvg);
                markLinkedFlowchartNodes();
                unwrapMermaidNodeAnchors();
                attachLinkedNodeClickHandlers();
            }
            hideLinkTooltip();
            setCopyEnabled(true);
            hasRenderedDiagram = true;
            if (!(preserveViewport && sourceUnchanged)) {
                scheduleFitToView();
            }
        } catch (err) {
            if (id !== renderId) {
                return;
            }
            diagram.replaceChildren();
            setCopyEnabled(false);
            hasRenderedDiagram = false;
            showError(err instanceof Error ? err.message : String(err));
        }
    }

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.type) {
            case "update":
                void renderDiagram(message.source ?? "", { preserveViewport: true });
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
        if (isInteractiveDiagramTarget(target)) {
            return false;
        }
        if (target.closest(".clickable") !== null) {
            return true;
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
        if (button === 0 && isInteractiveDiagramTarget(target)) {
            return false;
        }
        return button === 0 && !isOverSelectableText(target);
    }

    function shouldStartPanForEvent(event) {
        if (event.button === 1) {
            return true;
        }
        if (pointerHitLinkedNode(event)) {
            return false;
        }
        const target = pointerEventDiagramTarget(event);
        if (event.button === 0 && isInteractiveDiagramTarget(target)) {
            return false;
        }
        return event.button === 0 && !isOverSelectableText(target);
    }

    viewport.addEventListener("pointerdown", (event) => {
        if (!shouldStartPanForEvent(event)) {
            return;
        }
        event.preventDefault();
        hideLinkTooltip();
        isPanning = true;
        panStartX = event.clientX;
        panStartY = event.clientY;
        panOriginX = panX;
        panOriginY = panY;
        canvas.classList.add("panning");
        viewport.classList.add("panning");
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
        viewport.classList.remove("panning");
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
