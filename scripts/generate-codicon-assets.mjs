import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import opentype from "opentype.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cssPath = join(root, "media", "actionPanelEditor", "codicon.css");
const ttfPath = join(root, "media", "actionPanelEditor", "codicon.ttf");
const svgDir = join(root, "media", "codicons");
const codepointsPath = join(root, "media", "actionPanelEditor", "codicon-codepoints.json");

const THEME_COLORS = {
    light: "#424242",
    dark: "#C5C5C5",
};

const css = readFileSync(cssPath, "utf8");
const font = opentype.loadSync(ttfPath);
const codepoints = {};

for (const match of css.matchAll(/\.codicon-([a-z0-9-]+):before\s*\{\s*content:\s*"\\([0-9a-fA-F]+)"\s*\}/g)) {
    const icon = match[1];
    const cp = Number.parseInt(match[2], 16);
    if (!Number.isNaN(cp)) {
        codepoints[icon] = cp;
    }
}

function writeSvg(targetPath, pathData, viewBox, fill) {
    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="${fill}">`,
        `<path d="${pathData}"/>`,
        "</svg>",
    ].join("");
    writeFileSync(targetPath, svg);
}

for (const theme of Object.keys(THEME_COLORS)) {
    mkdirSync(join(svgDir, theme), { recursive: true });
}

for (const [icon, cp] of Object.entries(codepoints)) {
    const glyph = font.charToGlyph(String.fromCharCode(cp));
    const path = glyph.getPath(0, 16, 16);
    const bounds = path.getBoundingBox();
    const padding = 1;
    const minX = Math.floor(bounds.x1) - padding;
    const minY = Math.floor(bounds.y1) - padding;
    const width = Math.ceil(bounds.x2 - bounds.x1) + padding * 2;
    const height = Math.ceil(bounds.y2 - bounds.y1) + padding * 2;
    const viewBox = `${minX} ${minY} ${width} ${height}`;
    const pathData = path.toPathData(2);

    for (const [theme, fill] of Object.entries(THEME_COLORS)) {
        writeSvg(join(svgDir, theme, `${icon}.svg`), pathData, viewBox, fill);
    }
}

writeFileSync(codepointsPath, JSON.stringify(codepoints));
console.log(`Generated ${Object.keys(codepoints).length} codicon assets`);
