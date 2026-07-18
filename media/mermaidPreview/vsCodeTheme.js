// @ts-check
(function () {
    function isDarkVsCodeTheme() {
        return (
            document.body.classList.contains("vscode-dark") ||
            (document.body.classList.contains("vscode-high-contrast") &&
                !document.body.classList.contains("vscode-high-contrast-light"))
        );
    }

    /**
     * @param {string} name
     * @returns {string}
     */
    function readCssVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    /**
     * @param {string} value
     * @returns {string | undefined}
     */
    function rgbStringToHex(value) {
        const match = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
        if (!match) {
            return undefined;
        }

        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);
        const a = match[4] !== undefined ? Math.round(parseFloat(match[4]) * 255) : 255;
        const hex = (/** @type {number} */ n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");

        return a < 255 ? `#${hex(r)}${hex(g)}${hex(b)}${hex(a)}` : `#${hex(r)}${hex(g)}${hex(b)}`;
    }

    /**
     * @param {string} cssValue
     * @returns {string | undefined}
     */
    function resolveCssColor(cssValue) {
        const probe = document.createElement("span");
        probe.style.display = "none";
        probe.style.color = cssValue;
        document.body.appendChild(probe);
        try {
            return rgbStringToHex(getComputedStyle(probe).color);
        } finally {
            probe.remove();
        }
    }

    /**
     * @param {...string} varNames
     * @returns {string | undefined}
     */
    function pickColor(...varNames) {
        for (const name of varNames) {
            if (!readCssVar(name)) {
                continue;
            }

            const hex = resolveCssColor(`var(${name})`);
            if (hex) {
                return hex;
            }
        }
        return undefined;
    }

    /**
     * @param {string} hex
     * @returns {{ r: number, g: number, b: number } | undefined}
     */
    function parseHex(hex) {
        const match = hex.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
        if (!match) {
            return undefined;
        }

        return {
            r: parseInt(match[1].slice(0, 2), 16),
            g: parseInt(match[1].slice(2, 4), 16),
            b: parseInt(match[1].slice(4, 6), 16),
        };
    }

    /**
     * @param {string} base
     * @param {string} accent
     * @param {number} accentWeight
     * @returns {string | undefined}
     */
    function blendHex(base, accent, accentWeight) {
        const baseRgb = parseHex(base);
        const accentRgb = parseHex(accent);
        if (!baseRgb || !accentRgb) {
            return undefined;
        }

        const weight = Math.max(0, Math.min(1, accentWeight));
        const inverse = 1 - weight;
        const toHex = (/** @type {number} */ n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");

        return `#${toHex(Math.round(baseRgb.r * inverse + accentRgb.r * weight))}${toHex(
            Math.round(baseRgb.g * inverse + accentRgb.g * weight)
        )}${toHex(Math.round(baseRgb.b * inverse + accentRgb.b * weight))}`;
    }

    /**
     * @param {string[]} baseVars
     * @param {string[]} accentVars
     * @param {number} weight
     * @returns {string | undefined}
     */
    function pickBlended(baseVars, accentVars, weight) {
        const base = pickColor(...baseVars);
        const accent = pickColor(...accentVars);
        if (base && accent) {
            return blendHex(base, accent, weight) ?? base;
        }
        return base ?? accent;
    }

    /**
     * Theme mapping aligned with workbench.colorCustomizations in settings.json:
     * surfaces (#282c34 / #21252b / #252931), borders (#3a3f4b), text (#abb2bf),
     * accent (#35A854), selection (#3e4451).
     *
     * Contrast rules:
     * - Connectors use foreground-tinted strokes (borders alone are too faint).
     * - Node fills are lifted from the canvas so boxes read as surfaces.
     * - Cluster / actor outlines use muted text, not panel borders alone.
     *
     * @returns {Record<string, string | boolean>}
     */
    function getThemeVariables() {
        /** @type {Record<string, string | boolean>} */
        const variables = {
            darkMode: isDarkVsCodeTheme(),
        };

        /**
         * @param {string} key
         * @param {string | undefined} color
         */
        const setValue = (key, color) => {
            if (color) {
                variables[key] = color;
            }
        };

        /**
         * @param {string} key
         * @param {...string} varNames
         */
        const set = (key, ...varNames) => {
            setValue(key, pickColor(...varNames));
        };

        /**
         * @param {string} key
         * @param {number} weight
         * @param {string[]} baseVars
         * @param {string[]} accentVars
         */
        const setBlended = (key, weight, baseVars, accentVars) => {
            setValue(key, pickBlended(baseVars, accentVars, weight));
        };

        const border = [
            "--vscode-editorWidget-border",
            "--vscode-panel-border",
            "--vscode-editorGroup-border",
            "--vscode-sideBarSectionHeader-border",
        ];
        const canvas = ["--vscode-editor-background"];
        const surface = ["--vscode-editorWidget-background", "--vscode-input-background"];
        const surfaceAlt = [
            "--vscode-input-background",
            "--vscode-sideBar-background",
            "--vscode-editorWidget-background",
        ];
        const clusterSurface = ["--vscode-sideBar-background", "--vscode-input-background"];
        const text = ["--vscode-editor-foreground", "--vscode-foreground"];
        const textMuted = ["--vscode-descriptionForeground", "--vscode-editorLineNumber-foreground", ...text];
        const accent = ["--vscode-focusBorder", "--vscode-textLink-foreground", "--vscode-button-background"];
        const selection = [
            "--vscode-list-activeSelectionBackground",
            "--vscode-editor-selectionBackground",
            "--vscode-list-focusBackground",
        ];
        const chartsBlue = ["--vscode-charts-blue", ...accent];
        const chartsGreen = ["--vscode-charts-green", ...accent];
        const chartsPurple = ["--vscode-charts-purple", ...accent];

        // Connectors: border mixed toward foreground (~4.5:1+ on typical dark themes)
        const connector = pickBlended(border, text, 0.75) ?? pickColor(...text, ...border);
        const connectorMuted = pickBlended(border, text, 0.6) ?? pickColor(...textMuted, ...border);

        // Canvas
        set("background", ...canvas);
        set("textColor", ...text);
        set("titleColor", ...text);

        // Shared lines / arrows — foreground-tinted, not raw borders
        setValue("lineColor", connector);
        setValue("arrowheadColor", connector);
        setValue("defaultLinkColor", connector);

        // Leaf nodes — lift fill off the canvas so boxes are visible
        setBlended("primaryColor", 0.22, surface, text);
        set("primaryTextColor", ...text);
        setBlended("mainBkg", 0.22, surface, text);
        setBlended("stateBkg", 0.22, surface, text);
        setBlended("labelBackgroundColor", 0.22, surface, text);
        set("nodeTextColor", ...text);
        set("primaryBorderColor", ...chartsBlue, ...border);
        set("nodeBorder", ...chartsBlue, ...border);

        // Secondary tier — stronger blue tint than before
        setBlended("secondaryColor", 0.22, surface, chartsBlue);
        set("secondaryTextColor", ...text);
        set("secondaryBorderColor", ...chartsPurple, ...border);

        // Subgraph / cluster container tier — readable outline + green tint
        setBlended("tertiaryColor", 0.18, clusterSurface, chartsGreen);
        set("tertiaryTextColor", ...text);
        setValue("tertiaryBorderColor", connectorMuted ?? pickColor(...border));
        setBlended("clusterBkg", 0.18, clusterSurface, chartsGreen);
        setValue("clusterBorder", connectorMuted ?? pickColor(...border));

        // Composite state regions — selection with purple tint
        setBlended("altBackground", 0.14, selection, chartsPurple);

        // Sequence diagrams — match flowchart contrast for actors / signals
        setBlended("actorBkg", 0.22, surface, text);
        set("actorBorder", ...chartsBlue, ...border);
        set("actorTextColor", ...text);
        setValue("actorLineColor", connectorMuted ?? connector);
        setValue("signalColor", connector);
        set("signalTextColor", ...text);
        setBlended("labelBoxBkgColor", 0.12, surfaceAlt, text);
        setValue("labelBoxBorderColor", connectorMuted ?? pickColor(...border));
        set("labelTextColor", ...text);
        set("loopTextColor", ...text);
        set("activationBkgColor", ...selection);
        set("activationBorderColor", ...accent, ...border);
        set("sequenceNumberColor", ...text);

        // Gantt
        set("sectionBkgColor", "--vscode-sideBar-background", "--vscode-editor-background");
        set("altSectionBkgColor", "--vscode-input-background", "--vscode-editorWidget-background");
        set("sectionBkgColor2", "--vscode-editor-background");
        setValue("gridColor", connectorMuted ?? pickColor("--vscode-editorIndentGuide-background", ...border));
        setBlended("taskBkgColor", 0.12, surfaceAlt, text);
        setValue("taskBorderColor", connectorMuted ?? pickColor(...border));
        set("taskTextColor", ...text);
        set("taskTextOutsideColor", ...text);
        set("taskTextLightColor", ...text);
        set("taskTextDarkColor", ...text);
        set("activeTaskBkgColor", ...selection);
        set("activeTaskBorderColor", ...accent);
        set("doneTaskBkgColor", "--vscode-list-inactiveSelectionBackground", ...selection);
        set("doneTaskBorderColor", ...border);
        set(
            "critBkgColor",
            "--vscode-editorError-foreground",
            "--vscode-inputValidation-errorBorder",
            "--vscode-charts-red"
        );
        set(
            "critBorderColor",
            "--vscode-editorError-foreground",
            "--vscode-inputValidation-errorBorder",
            "--vscode-charts-red"
        );
        set("todayLineColor", ...accent);
        setValue("vertLineColor", connectorMuted ?? pickColor(...border));

        // Notes / labels
        setBlended("noteBkgColor", 0.12, surfaceAlt, text);
        set("noteTextColor", ...text);
        setValue("noteBorderColor", connectorMuted ?? pickColor(...border));
        set("edgeLabelBackground", ...canvas);
        set("edgeLabelColor", ...text);

        // Errors
        set("errorBkgColor", "--vscode-inputValidation-errorBackground", "--vscode-editorError-background");
        set("errorTextColor", "--vscode-editorError-foreground", ...text);

        // Accent palette for pie charts, quadrant charts, git branches, etc.
        const palette = [
            "--vscode-focusBorder",
            "--vscode-textLink-foreground",
            "--vscode-button-background",
            "--vscode-list-activeSelectionBackground",
            "--vscode-button-secondaryBackground",
            "--vscode-badge-background",
            "--vscode-charts-blue",
            "--vscode-charts-green",
            "--vscode-charts-orange",
            "--vscode-charts-red",
            "--vscode-charts-purple",
            "--vscode-charts-yellow",
        ];
        for (let i = 0; i < palette.length; i++) {
            set(`pie${i + 1}`, palette[i]);
            set(`cScale${i}`, palette[i]);
        }

        const fontFamily = readCssVar("--vscode-font-family");
        if (fontFamily) {
            variables.fontFamily = fontFamily;
        }

        const fontSize = readCssVar("--vscode-font-size");
        if (fontSize) {
            variables.fontSize = fontSize;
        }

        return variables;
    }

    window.IbMermaidVsCodeTheme = {
        getThemeVariables,
    };
})();
