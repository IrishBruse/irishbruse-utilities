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
     * - Node fills use the sidebar surface so boxes read against the editor canvas.
     * - Outlines use workbench border tokens, not accent / chart blues.
     * - Connectors and arrowheads use text foreground.
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
        const sidebar = ["--vscode-sideBar-background"];
        const nodeSurface = ["--vscode-editorWidget-background", "--vscode-input-background"];
        const surfaceAlt = [
            "--vscode-input-background",
            "--vscode-sideBar-background",
            "--vscode-editorWidget-background",
        ];
        const text = ["--vscode-editor-foreground", "--vscode-foreground"];
        const textMuted = ["--vscode-descriptionForeground", "--vscode-editorLineNumber-foreground", ...text];
        const accent = ["--vscode-focusBorder", "--vscode-textLink-foreground", "--vscode-button-background"];
        const selection = [
            "--vscode-list-activeSelectionBackground",
            "--vscode-editor-selectionBackground",
            "--vscode-list-focusBackground",
        ];
        const chartsPurple = ["--vscode-charts-purple", ...accent];

        const connectorMuted = pickBlended(border, text, 0.6) ?? pickColor(...textMuted, ...border);
        const foreground = pickColor(...text);

        // Canvas
        set("background", ...canvas);
        set("textColor", ...text);
        set("titleColor", ...text);

        // Shared lines / arrows — text foreground
        setValue("lineColor", foreground);
        setValue("arrowheadColor", foreground);
        setValue("defaultLinkColor", foreground);

        // Leaf nodes — solid widget surfaces inside subgraph frames
        set("primaryColor", ...nodeSurface);
        set("primaryTextColor", ...text);
        set("mainBkg", ...nodeSurface);
        set("stateBkg", ...nodeSurface);
        set("stateLabelColor", ...text);
        set("stateBorder", ...border);
        set("labelBackgroundColor", ...sidebar);
        set("nodeTextColor", ...text);
        set("primaryBorderColor", ...border);
        set("nodeBorder", ...border);

        // Secondary tier
        set("secondaryColor", ...nodeSurface);
        set("secondaryTextColor", ...text);
        set("secondaryBorderColor", ...border);

        // Subgraph / cluster container tier — CSS alternates odd/even cluster fills
        set("tertiaryColor", ...sidebar);
        set("tertiaryTextColor", ...text);
        set("tertiaryBorderColor", ...border);
        set("clusterBkg", ...sidebar);
        set("clusterBorder", ...border);

        // Composite state regions — selection with purple tint
        setBlended("altBackground", 0.14, selection, chartsPurple);
        set("compositeBackground", ...canvas);
        set("compositeTitleBackground", ...sidebar);
        setValue("transitionColor", foreground);
        set("transitionLabelColor", ...text);
        set("specialStateColor", ...text);

        // Sequence diagrams — match flowchart contrast for actors / signals
        set("actorBkg", ...nodeSurface);
        set("actorBorder", ...border);
        set("actorTextColor", ...text);
        setValue("actorLineColor", foreground);
        setValue("signalColor", foreground);
        set("signalTextColor", ...text);
        setBlended("labelBoxBkgColor", 0.12, surfaceAlt, text);
        setValue("labelBoxBorderColor", connectorMuted ?? pickColor(...border));
        set("labelTextColor", ...text);
        set("loopTextColor", ...text);
        set("activationBkgColor", ...selection);
        set("activationBorderColor", ...accent, ...border);
        // Sequence autonumber: editor background circle, foreground digits
        set("sequenceNumberColor", ...text);

        // Gantt — approximate Mermaid default theme using VS Code tokens
        const dark = isDarkVsCodeTheme();
        const canvasColor = pickColor(...canvas);
        const chartBlue = pickColor("--vscode-charts-blue", "--vscode-textLink-foreground");
        const chartPurple = pickColor("--vscode-charts-purple", "--vscode-focusBorder");
        const chartRed = pickColor("--vscode-charts-red", "--vscode-editorError-foreground");
        const chartYellow = pickColor("--vscode-charts-yellow");

        // Alternating section bands (section1/3 use altSectionBkgColor at 20% opacity)
        if (dark) {
            setValue(
                "sectionBkgColor",
                chartBlue && canvasColor ? blendHex(canvasColor, chartBlue, 0.14) : canvasColor
            );
            setValue("altSectionBkgColor", foreground ?? "#ffffff");
            setValue(
                "sectionBkgColor2",
                chartYellow && canvasColor ? blendHex(canvasColor, chartYellow, 0.1) : canvasColor
            );
        } else {
            set("sectionBkgColor", "--vscode-sideBarSectionHeader-background", ...surfaceAlt);
            set("altSectionBkgColor", ...canvas);
            set("sectionBkgColor2", "--vscode-input-background", ...surfaceAlt);
        }

        setValue("gridColor", pickColor("--vscode-editorIndentGuide-background", ...border) ?? connectorMuted);
        setValue("vertLineColor", pickColor("--vscode-editorIndentGuide-background", ...border) ?? connectorMuted);

        // Default tasks — purple-blue bars like the official theme
        setValue("taskBkgColor", chartPurple ?? pickBlended(surfaceAlt, chartsPurple, 0.55));
        setValue(
            "taskBorderColor",
            chartPurple && canvasColor ? blendHex(chartPurple, canvasColor, 0.35) : pickColor(...border)
        );

        // Done tasks — light grey fills
        setValue(
            "doneTaskBkgColor",
            dark
                ? (canvasColor ? blendHex(canvasColor, "#d3d3d3", 0.82) : "#d3d3d3")
                : pickBlended(surfaceAlt, text, 0.35)
        );
        setValue("doneTaskBorderColor", pickColor(...border) ?? connectorMuted);

        // Active tasks — medium blue fill
        setValue("activeTaskBkgColor", chartBlue ?? pickBlended(surfaceAlt, ["--vscode-charts-blue"], 0.65));
        setValue(
            "activeTaskBorderColor",
            chartBlue && canvasColor ? blendHex(chartBlue, canvasColor, 0.3) : pickColor(...accent)
        );

        // Critical tasks — red fill
        setValue("critBkgColor", chartRed ?? pickColor("--vscode-editorError-foreground"));
        setValue(
            "critBorderColor",
            chartRed && canvasColor ? blendHex(chartRed, "#ffffff", 0.35) : chartRed
        );

        // In-bar text: light on purple/default bars, dark on done/active light bars
        setValue("taskTextColor", dark ? "#ffffff" : (foreground ?? pickColor(...text)));
        setValue(
            "taskTextDarkColor",
            dark ? (canvasColor ?? "#282c34") : (foreground ?? pickColor(...text))
        );
        setValue("taskTextOutsideColor", foreground ?? pickColor(...text));
        setValue("taskTextLightColor", dark ? "#ffffff" : (foreground ?? pickColor(...text)));
        set("todayLineColor", ...accent);

        // Notes / labels
        setBlended("noteBkgColor", 0.12, surfaceAlt, text);
        set("noteTextColor", ...text);
        setValue("noteBorderColor", connectorMuted ?? pickColor(...border));
        set("edgeLabelBackground", ...canvas);
        set("edgeLabelColor", ...text);

        // ER diagram entity tables — accent grid, alternating row surfaces
        set("rowOdd", ...sidebar);
        set("rowEven", "--vscode-input-background", "--vscode-sideBarSectionHeader-background", ...nodeSurface);

        // Errors
        set("errorBkgColor", "--vscode-inputValidation-errorBackground", "--vscode-editorError-background");
        set("errorTextColor", "--vscode-editorError-foreground", ...text);

        // Pie charts — legend/title on canvas; slice % labels on colored fills
        set("pieTitleTextColor", ...text);
        set("pieLegendTextColor", ...text);
        setValue(
            "pieSectionTextColor",
            dark ? "#ffffff" : (canvasColor ?? pickColor(...canvas) ?? "#ffffff")
        );
        setValue("pieStrokeColor", pickColor(...border) ?? connectorMuted ?? foreground);
        setValue("pieOuterStrokeColor", pickColor(...border) ?? connectorMuted ?? foreground);
        setValue("pieOpacity", "1");

        const piePalette = [
            "--vscode-charts-blue",
            "--vscode-charts-orange",
            "--vscode-charts-purple",
            "--vscode-charts-red",
            "--vscode-charts-yellow",
            "--vscode-charts-green",
            "--vscode-textLink-foreground",
            "--vscode-badge-background",
            "--vscode-button-secondaryBackground",
            "--vscode-list-activeSelectionBackground",
            "--vscode-focusBorder",
            "--vscode-button-background",
        ];
        for (let i = 0; i < piePalette.length; i++) {
            set(`pie${i + 1}`, piePalette[i]);
        }

        // Accent palette for quadrant charts, git branches, etc.
        const palette = [
            "--vscode-charts-blue",
            "--vscode-charts-orange",
            "--vscode-charts-purple",
            "--vscode-charts-red",
            "--vscode-charts-yellow",
            "--vscode-charts-green",
            "--vscode-textLink-foreground",
            "--vscode-badge-background",
            "--vscode-button-secondaryBackground",
            "--vscode-list-activeSelectionBackground",
            "--vscode-focusBorder",
            "--vscode-button-background",
        ];
        for (let i = 0; i < palette.length; i++) {
            set(`cScale${i}`, palette[i]);
        }

        const fontFamily = readCssVar("--vscode-font-family");
        if (fontFamily) {
            variables.fontFamily = fontFamily;
        }

        return variables;
    }

    window.IbMermaidVsCodeTheme = {
        getThemeVariables,
    };
})();
