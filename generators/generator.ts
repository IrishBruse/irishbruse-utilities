import { writeFileSync } from "fs";
import pkg from "../package.json" assert { type: "json" };
import { Package } from "./package.types.js";
import path from "path";

const prefix = pkg.name;

const outputLines: string[] = [];

export function getPackage(): Package {
    return pkg as any;
}

export function toPascalCase(str: string) {
    return str
        .replace(/[-_]+/g, " ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
}

export function toTitleCase(str: string) {
    return str
        .replace(/[-_]+/g, " ")
        .split(" ")
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// Helper to strip the package prefix (everything before the first dot) from a command string.
export function stripPackagePrefix(command: string): string {
    return command.replace(prefix + ".", "");
}

export function iconToImage(icon?: string) {
    if (!icon) {
        return "";
    }
    icon = icon.slice(2, -1);

    return `![](https://raw.githubusercontent.com/microsoft/vscode-codicons/refs/heads/main/src/icons/${icon}.svg)`;
}

export function l(input?: string, condition: boolean = false) {
    if (!!condition) {
        return;
    }

    if (!input || input === "") {
        outputLines.push("");
        return;
    }

    let line = "";

    for (let i = 0; i < indention * 4; i++) {
        line += " ";
    }

    if (isDocComment) {
        line += " * ";
    }

    line += input;
    outputLines.push(line);
}

let isDocComment = false;
let indention = 0;

export function indent() {
    indention++;
}

export function dedent() {
    indention--;
}

export function startDoc(): void {
    l(`/**`);
    isDocComment = true;
}

export function endDoc(): void {
    isDocComment = false;
    l(` */`);
}

export function inlineDoc(input: string): void {
    l(`/** ${input} */`);
}

export function outputFile(file: string) {
    writeFileSync(path.resolve(file), outputLines.join("\n"));
    console.log("Generated " + file);
}
