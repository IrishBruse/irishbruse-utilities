import fs from "fs";
import pkg from "./package.json" with { type: "json" };

const contributes = pkg.contributes;
const prefix = pkg.name;

// Helper to convert strings into PascalCase.
function toPascalCase(str: string) {
    return str
        .replace(/[-_]+/g, " ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
}

// Helper to strip the package prefix (everything before the first dot) from a command string.
function stripPackagePrefix(command: string): string {
    return command.replace(prefix + ".", "");
}

/**
 * Adds a doc comment block to the given lines array.
 * @param lines Array to append the comment block to.
 * @param comments Array of comment lines.
 * @param indent Optional indent string (default is empty).
 */
function addDocComment(lines: string[], comments: string[], indent: string = ""): void {
    lines.push(`${indent}/**`);
    comments.forEach((line) => lines.push(`${indent} * ${line}  `));
    lines.push(`${indent} */`);
}

// Array to hold each output line.
const outputLines: string[] = [];

// Header.
outputLines.push(`// This file is auto-generated. Do not modify directly.`);
outputLines.push(``);

// Generate enum for commands.
if (contributes.commands) {
    addDocComment(outputLines, ["Commands"]);
    outputLines.push("export enum Commands {");
    type Command = {
        command: string;
        title: string;
        shortTitle: string;
        icon?: string;
    };
    contributes.commands.forEach((cmd: Command) => {
        const stripped = stripPackagePrefix(cmd.command);
        const constName = toPascalCase(stripped);
        const docs = [cmd.title, `Short Title: ${cmd.shortTitle}`, ...(cmd.icon ? [`Icon: ${cmd.icon}`] : [])];
        addDocComment(outputLines, docs, "  ");
        // Using a multiline template string for the value.
        outputLines.push(`  ${constName} = \`${cmd.command}\`,`);
    });
    outputLines.push(`}`);
    outputLines.push(``);
}

// Generate enum for view containers.
if (contributes.viewsContainers) {
    addDocComment(outputLines, ["View Containers"]);
    outputLines.push("export enum ViewContainers {");
    type Container = {
        id: string;
        title: string;
        icon: string;
    };
    if (contributes.viewsContainers.activitybar) {
        contributes.viewsContainers.activitybar.forEach((container: Container) => {
            const constName = toPascalCase(container.id);
            const docs = [container.title, `Icon: ${container.icon}`];
            addDocComment(outputLines, docs, "  ");
            outputLines.push(`  ${constName} = \`${container.id}\`,`);
        });
    }
    outputLines.push(`}`);
    outputLines.push(``);
}

// Generate enum for views.
if (contributes.views) {
    addDocComment(outputLines, ["Views"]);
    outputLines.push("export enum Views {");
    type View = {
        id: string;
        name: string;
    };
    for (const containerId in contributes.views) {
        contributes.views[containerId].forEach((view: View) => {
            const constName = toPascalCase(view.id);
            const docs = ["Header: " + view.name, `ContainerId: ${containerId}`];
            addDocComment(outputLines, docs, "  ");
            outputLines.push(`  ${constName} = \`${view.id}\`,`);
        });
    }
    outputLines.push(`}`);
    outputLines.push(``);
}

fs.writeFileSync("src/Contributes.ts", outputLines.join("\n"));
console.log("Generated src/Contributes.ts");
