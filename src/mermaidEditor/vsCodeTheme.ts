export type ColorPicker = (...varNames: string[]) => string | undefined;

export type CssVarReader = (name: string) => string;

export interface MermaidTokens {
    dark: boolean;
    fg: string;
    bg: string;
    surface: string;
    surfaceAlt: string;
    sidebar: string;
    border: string;
    line: string;
    muted: string;
    accent: string;
    selection: string;
    warning: string;
    warningBorder: string;
    connectorMuted: string;
    chartBlue: string;
    chartPurple: string;
    chartRed: string;
    chartYellow: string;
    fontFamily: string;
    charts: string[];
}

export const TOKEN_CSS_VARS: Record<keyof MermaidTokens, string | null> = {
    dark: null,
    fg: "--ib-fg",
    bg: "--ib-bg",
    surface: "--ib-surface",
    surfaceAlt: "--ib-surface-alt",
    sidebar: "--ib-sidebar",
    border: "--ib-border",
    line: "--ib-line",
    muted: "--ib-muted",
    accent: "--ib-accent",
    selection: "--ib-selection",
    warning: "--ib-warning",
    warningBorder: "--ib-warning-border",
    connectorMuted: "--ib-connector-muted",
    chartBlue: "--ib-chart-blue",
    chartPurple: "--ib-chart-purple",
    chartRed: "--ib-chart-red",
    chartYellow: "--ib-chart-yellow",
    fontFamily: "--ib-font-family",
    charts: null,
};

const BORDER_VARS = [
    "--vscode-editorWidget-border",
    "--vscode-panel-border",
    "--vscode-editorGroup-border",
    "--vscode-sideBarSectionHeader-border",
];

const CANVAS_VARS = ["--vscode-editor-background"];

const SIDEBAR_VARS = ["--vscode-sideBar-background"];

const NODE_SURFACE_VARS = ["--vscode-editorWidget-background", "--vscode-input-background"];

const SURFACE_ALT_VARS = [
    "--vscode-input-background",
    "--vscode-sideBar-background",
    "--vscode-editorWidget-background",
];

const TEXT_VARS = ["--vscode-editor-foreground", "--vscode-foreground"];

const TEXT_MUTED_VARS = [
    "--vscode-descriptionForeground",
    "--vscode-editorLineNumber-foreground",
    ...TEXT_VARS,
];

const ACCENT_VARS = [
    "--vscode-focusBorder",
    "--vscode-textLink-foreground",
    "--vscode-button-background",
];

const SELECTION_VARS = [
    "--vscode-list-activeSelectionBackground",
    "--vscode-editor-selectionBackground",
    "--vscode-list-focusBackground",
];

const CHARTS_PURPLE_VARS = ["--vscode-charts-purple", ...ACCENT_VARS];

const CHART_PALETTE_VARS = [
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

const PIE_PALETTE_VARS = CHART_PALETTE_VARS;

const GIT_PALETTE_VARS = CHART_PALETTE_VARS.slice(0, 8);

export function parseHex(hex: string): { r: number; g: number; b: number } | undefined {
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

export function blendHex(base: string, accent: string, accentWeight: number): string | undefined {
    const baseRgb = parseHex(base);
    const accentRgb = parseHex(accent);
    if (!baseRgb || !accentRgb) {
        return undefined;
    }

    const weight = Math.max(0, Math.min(1, accentWeight));
    const inverse = 1 - weight;
    const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");

    return `#${toHex(Math.round(baseRgb.r * inverse + accentRgb.r * weight))}${toHex(
        Math.round(baseRgb.g * inverse + accentRgb.g * weight)
    )}${toHex(Math.round(baseRgb.b * inverse + accentRgb.b * weight))}`;
}

export function pickBlended(
    pickColor: ColorPicker,
    baseVars: string[],
    accentVars: string[],
    weight: number
): string | undefined {
    const base = pickColor(...baseVars);
    const accent = pickColor(...accentVars);
    if (base && accent) {
        return blendHex(base, accent, weight) ?? base;
    }
    return base ?? accent;
}

function requireColor(pickColor: ColorPicker, ...varNames: string[]): string {
    return pickColor(...varNames) ?? "#000000";
}

/**
 * Semantic VS Code → diagram tokens. Single source for themeVariables, themeCSS, and --ib-* vars.
 */
export function getTokens(
    pickColor: ColorPicker,
    readCssVar: CssVarReader,
    isDark: () => boolean
): MermaidTokens {
    const dark = isDark();
    const fg = requireColor(pickColor, ...TEXT_VARS);
    const bg = requireColor(pickColor, ...CANVAS_VARS);
    const surface = requireColor(pickColor, ...NODE_SURFACE_VARS);
    const surfaceAlt = requireColor(pickColor, ...SURFACE_ALT_VARS);
    const sidebar = requireColor(pickColor, ...SIDEBAR_VARS);
    const border = requireColor(pickColor, ...BORDER_VARS);
    const muted = requireColor(pickColor, ...TEXT_MUTED_VARS);
    const accent = requireColor(pickColor, ...ACCENT_VARS);
    const selection = requireColor(pickColor, ...SELECTION_VARS);
    const connectorMuted = pickBlended(pickColor, BORDER_VARS, TEXT_VARS, 0.6) ?? muted ?? border;
    const chartBlue = requireColor(pickColor, "--vscode-charts-blue", "--vscode-textLink-foreground");
    const chartPurple = requireColor(pickColor, "--vscode-charts-purple", "--vscode-focusBorder");
    const chartRed = requireColor(pickColor, "--vscode-charts-red", "--vscode-editorError-foreground");
    const chartYellow = pickColor("--vscode-charts-yellow") ?? chartBlue;
    const warning = requireColor(
        pickColor,
        "--vscode-editorWarning-background",
        "--vscode-editorWidget-background"
    );
    const warningBorder = requireColor(pickColor, "--vscode-editorWarning-border", "--vscode-focusBorder");
    const fontFamily = readCssVar("--vscode-font-family") || "sans-serif";
    const charts = CHART_PALETTE_VARS.map((name) => requireColor(pickColor, name));

    return {
        dark,
        fg,
        bg,
        surface,
        surfaceAlt,
        sidebar,
        border,
        line: fg,
        muted,
        accent,
        selection,
        warning,
        warningBorder,
        connectorMuted,
        chartBlue,
        chartPurple,
        chartRed,
        chartYellow,
        fontFamily,
        charts,
    };
}

export function getThemeVariables(
    tokens: MermaidTokens,
    pickColor: ColorPicker
): Record<string, string | boolean> {
    const variables: Record<string, string | boolean> = {
        darkMode: tokens.dark,
    };

    const setValue = (key: string, color: string | undefined) => {
        if (color) {
            variables[key] = color;
        }
    };

    const set = (key: string, ...varNames: string[]) => {
        setValue(key, pickColor(...varNames));
    };

    const setBlended = (key: string, weight: number, baseVars: string[], accentVars: string[]) => {
        setValue(key, pickBlended(pickColor, baseVars, accentVars, weight));
    };

    const {
        dark,
        fg: foreground,
        bg: canvasColor,
        surface,
        surfaceAlt,
        sidebar,
        border,
        muted,
        accent,
        selection,
        connectorMuted,
        chartBlue,
        chartRed,
        fontFamily,
        charts,
    } = tokens;

    setValue("background", canvasColor);
    setValue("textColor", foreground);
    setValue("titleColor", foreground);
    setValue("lineColor", foreground);
    setValue("arrowheadColor", foreground);
    setValue("defaultLinkColor", foreground);

    setValue("primaryColor", surface);
    setValue("primaryTextColor", foreground);
    setValue("mainBkg", surface);
    setValue("stateBkg", surface);
    setValue("stateLabelColor", foreground);
    set("stateBorder", ...BORDER_VARS);
    setValue("labelBackgroundColor", sidebar);
    setValue("nodeTextColor", foreground);
    setValue("primaryBorderColor", border);
    setValue("nodeBorder", border);

    setValue("secondaryColor", surface);
    setValue("secondaryTextColor", foreground);
    setValue("secondaryBorderColor", border);

    setValue("tertiaryColor", sidebar);
    setValue("tertiaryTextColor", foreground);
    setValue("tertiaryBorderColor", border);
    setValue("clusterBkg", sidebar);
    setValue("clusterBorder", border);

    setBlended("altBackground", 0.14, SELECTION_VARS, CHARTS_PURPLE_VARS);
    setValue("compositeBackground", canvasColor);
    setValue("compositeTitleBackground", sidebar);
    setValue("transitionColor", foreground);
    setValue("transitionLabelColor", foreground);
    setValue("specialStateColor", foreground);

    setValue("actorBkg", surface);
    setValue("actorBorder", border);
    setValue("actorTextColor", foreground);
    setValue("actorLineColor", foreground);
    setValue("signalColor", foreground);
    setValue("signalTextColor", foreground);
    setBlended("labelBoxBkgColor", 0.12, SURFACE_ALT_VARS, TEXT_VARS);
    setValue("labelBoxBorderColor", connectorMuted);
    setValue("labelTextColor", foreground);
    setValue("loopTextColor", foreground);
    setValue("activationBkgColor", selection);
    set("activationBorderColor", ...ACCENT_VARS, ...BORDER_VARS);
    setValue("sequenceNumberColor", foreground);

    const taskBkg = blendHex(surface, accent, 0.12) ?? surface;
    const activeBkg = blendHex(surface, chartBlue, 0.38) ?? surface;
    const doneBkg = blendHex(canvasColor, muted, 0.35) ?? surfaceAlt;
    const critBkg = blendHex(chartRed, canvasColor, 0.18) ?? chartRed;

    if (dark) {
        setValue("sectionBkgColor", blendHex(canvasColor, surface, 0.35) ?? surface);
        setValue("altSectionBkgColor", blendHex(canvasColor, sidebar, 0.25) ?? sidebar);
        setValue("sectionBkgColor2", blendHex(canvasColor, surfaceAlt, 0.35) ?? surfaceAlt);
    } else {
        setValue("sectionBkgColor", surfaceAlt);
        setValue("altSectionBkgColor", canvasColor);
        setValue("sectionBkgColor2", surface);
    }

    setValue("gridColor", border);
    setValue("vertLineColor", border);

    setValue("taskBkgColor", taskBkg);
    setValue("taskBorderColor", border);
    setValue("doneTaskBkgColor", doneBkg);
    setValue("doneTaskBorderColor", border);
    setValue("activeTaskBkgColor", activeBkg);
    setValue("activeTaskBorderColor", blendHex(chartBlue, border, 0.45) ?? accent);
    setValue("critBkgColor", critBkg);
    setValue("critBorderColor", chartRed);
    setValue("taskTextColor", foreground);
    setValue("taskTextDarkColor", foreground);
    setValue("taskTextOutsideColor", foreground);
    setValue("taskTextLightColor", dark ? "#ffffff" : foreground);
    setValue("todayLineColor", accent);

    setBlended("noteBkgColor", 0.12, SURFACE_ALT_VARS, TEXT_VARS);
    setValue("noteTextColor", foreground);
    setValue("noteBorderColor", connectorMuted);
    setValue("edgeLabelBackground", canvasColor);
    setValue("edgeLabelColor", foreground);

    setValue("rowOdd", sidebar);
    set("rowEven", "--vscode-input-background", "--vscode-sideBarSectionHeader-background", ...NODE_SURFACE_VARS);

    set("errorBkgColor", "--vscode-inputValidation-errorBackground", "--vscode-editorError-background");
    set("errorTextColor", "--vscode-editorError-foreground", ...TEXT_VARS);

    setValue("branchLabelColor", foreground);
    setValue("commitLabelColor", foreground);
    setValue("commitLabelBackground", canvasColor);
    setValue("tagLabelColor", foreground);
    setValue("tagLabelBackground", surface);
    setValue("tagLabelBorder", border);
    setValue("commitLineColor", tokens.muted);
    for (let i = 0; i < 8; i++) {
        setValue(`gitBranchLabel${i}`, foreground);
    }
    for (let i = 0; i < GIT_PALETTE_VARS.length; i++) {
        set(`git${i}`, GIT_PALETTE_VARS[i]);
    }

    setValue("pieTitleTextColor", foreground);
    setValue("pieLegendTextColor", foreground);
    setValue("pieSectionTextColor", dark ? "#ffffff" : canvasColor);
    setValue("pieStrokeColor", border);
    setValue("pieOuterStrokeColor", border);
    setValue("pieOpacity", "1");

    for (let i = 0; i < PIE_PALETTE_VARS.length; i++) {
        set(`pie${i + 1}`, PIE_PALETTE_VARS[i]);
    }

    for (let i = 0; i < charts.length; i++) {
        setValue(`cScale${i}`, charts[i]);
    }

    variables.fontFamily = fontFamily;

    return variables;
}

export function getThemeCSS(tokens: MermaidTokens): string {
    const {
        fg,
        bg,
        surface,
        surfaceAlt,
        sidebar,
        border,
        line,
        muted,
        selection,
        accent,
        warning,
        warningBorder,
        fontFamily,
        chartBlue,
        chartRed,
    } = tokens;

    const taskBkg = blendHex(surface, accent, 0.12) ?? surface;
    const activeBkg = blendHex(surface, chartBlue, 0.38) ?? surface;
    const doneBkg = blendHex(bg, muted, 0.35) ?? surfaceAlt;
    const critBkg = blendHex(chartRed, bg, 0.18) ?? chartRed;
    const sectionBkg = blendHex(bg, surface, 0.35) ?? surface;
    const altSectionBkg = blendHex(bg, sidebar, 0.25) ?? sidebar;

  const nodeShape = `
.node:not(:has(.divider)) rect,
.node:not(:has(.divider)) circle,
.node:not(:has(.divider)) ellipse,
.node:not(:has(.divider)) polygon,
.node:not(:has(.divider)) path`;

    return `
/* Generic typography */
text { fill: ${fg}; }
foreignObject, foreignObject * { color: ${fg}; font-family: ${fontFamily}; }
.messageText, .loopText, .actor > text, .nodeLabel, .cluster-label, .titleText,
.stateLabel text, g.stateGroup text, g.stateGroup .state-title, .statediagramTitleText,
.noteText, .edgeLabel, .edgeLabel p, .edgeLabel span,
.gitTitleText, .branch-label, [class*="branch-label"], .commit-label, .commit-id,
.commit-msg, .tag-label, .pieTitleText, .legend text {
  fill: ${fg};
  color: ${fg};
  font-family: ${fontFamily};
}

/* Nodes & actors */
${nodeShape} {
  fill: ${surface};
  stroke: ${border};
  stroke-width: 1.5px;
}
.cluster ${nodeShape} {
  fill: ${surface};
}
.actor {
  fill: ${surface};
  stroke: ${border};
}

/* Clusters */
.cluster rect, .cluster path {
  fill: ${selection};
  fill-opacity: 0.08;
  stroke: ${border};
  stroke-width: 1.5px;
  stroke-dasharray: 4 6;
}

/* Edges */
.edgePath path, .flowchart-link, .messageLine0, .messageLine1, .relationshipLine {
  stroke: ${line};
  stroke-width: 1.5px;
}
marker polygon, marker path {
  fill: ${line};
  stroke: none;
}

/* Labels */
.edgeLabel, .edgeLabel p, .edgeLabel span, .labelBkg {
  color: ${fg};
  background-color: ${bg};
}
/* Gantt */
.section0 { fill: ${sectionBkg}; }
.section2 { fill: ${blendHex(bg, surfaceAlt, 0.35) ?? surfaceAlt}; }
.section1, .section3 { fill: ${altSectionBkg}; }
.sectionTitle, .sectionTitle tspan, .sectionTitle0, .sectionTitle1, .sectionTitle2, .sectionTitle3 {
  fill: ${fg};
  font-family: ${fontFamily};
  font-weight: 600;
}
.grid .tick text {
  fill: ${muted} !important;
  stroke: none !important;
  font-family: ${fontFamily};
}
.grid .tick line {
  stroke: ${border};
  opacity: 0.55;
}
.grid path {
  stroke-width: 0;
}
.task0, .task1, .task2, .task3 {
  fill: ${taskBkg};
  stroke: ${border};
}
.active0, .active1, .active2, .active3 {
  fill: ${activeBkg};
  stroke: ${blendHex(chartBlue, border, 0.45) ?? accent};
}
.done0, .done1, .done2, .done3 {
  fill: ${doneBkg};
  stroke: ${border};
}
.crit0, .crit1, .crit2, .crit3 {
  fill: ${critBkg};
  stroke: ${chartRed};
}
.taskText0, .taskText1, .taskText2, .taskText3,
.activeText0, .activeText1, .activeText2, .activeText3,
.doneText0, .doneText1, .doneText2, .doneText3 {
  fill: ${fg};
  font-family: ${fontFamily};
}
.critText0, .critText1, .critText2, .critText3 {
  fill: #ffffff;
  font-family: ${fontFamily};
}
.taskTextOutsideLeft, .taskTextOutsideRight,
.taskTextOutside0, .taskTextOutside1, .taskTextOutside2, .taskTextOutside3,
.milestoneText {
  fill: ${fg};
  font-family: ${fontFamily};
}
rect.task.milestone {
  fill: ${muted};
  stroke: ${border};
}
.today {
  stroke: ${accent};
}

/* Sequence notes */
.note {
  fill: ${warning};
  stroke: ${warningBorder};
}

/* ER relationship labels */
.relationshipLabelBox {
  fill: ${surface};
  stroke: ${border};
}

/* Git */
.commit-label-bkg, .branchLabelBkg, [class*="branchLabelBkg"] {
  fill: ${surface};
  stroke: ${border};
  stroke-width: 1px;
}
.branch {
  stroke: ${muted};
  opacity: 0.85;
}
.commit-merge, .commit-highlight-inner {
  fill: ${chartBlue};
  stroke: ${chartBlue};
}

/* Pie */
.pieCircle, .pieOuterCircle {
  stroke: ${border};
  opacity: 1;
}
`.trim();
}

export function applyDiagramTokens(
    element: { style: { setProperty(name: string, value: string): void } },
    tokens: MermaidTokens
): void {
    for (const [key, cssVar] of Object.entries(TOKEN_CSS_VARS)) {
        if (!cssVar) {
            continue;
        }
        const value = tokens[key as keyof MermaidTokens];
        if (typeof value === "string") {
            element.style.setProperty(cssVar, value);
        }
    }
}

export function isValidHexColor(value: string): boolean {
    return /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value);
}
