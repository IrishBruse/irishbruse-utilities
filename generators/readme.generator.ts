import { stat, writeFile } from "fs/promises";
import { l, toTitleCase, getPackage, outputFile } from "./generator.js";

const pkg = getPackage();
const contributes = pkg.contributes;

async function iconToImage(icon?: string) {
    if (!icon) {
        return "";
    }
    icon = icon.slice(2, -1);
    const svgPath = `docs/codicons/${icon}.svg`;

    try {
        await stat(svgPath);
    } catch (error) {
        const resp = await fetch(
            `https://raw.githubusercontent.com/microsoft/vscode-codicons/refs/heads/main/src/icons/${icon}.svg`
        );
        let svgContent = await resp.text();
        svgContent = svgContent.replace('fill="currentColor"', 'fill="#ABB2BF"');
        await writeFile(svgPath, svgContent);
    }

    return `![](${svgPath})`;
}

const { commands, configuration, views, viewsContainers } = contributes;

l(`# ${pkg.displayName || pkg.name} Contributions`);
l();
l(`${pkg.description}`);
l();

// Document commands.
if (commands) {
    l("## Commands");
    l();
    commands.forEach(async (cmd) => {
        l(`### ${cmd.title}`);
        l();
        l(`![${cmd.command} Screenshot](docs/commands/${cmd.command}.png)`);
        l();
        l(`- **Command:** \`${cmd.command}\``);
        l(`- **Short Title:** ${cmd.shortTitle}`);
        l(`- **Icon:** ${await iconToImage(cmd.icon)}`, !cmd.icon);
        l();
    });
}

// Document view containers.
if (viewsContainers && viewsContainers.activitybar) {
    l("## View Containers");
    l();
    viewsContainers.activitybar.forEach((container) => {
        l(`### ${container.title}`);
        l();
        l(`- **ID:** \`${container.id}\``);
        l(`- **Icon:** ![](${container.icon})`);
        l();
    });
}

// Document views.
if (views) {
    l("## Views");
    l();
    for (const containerId in views) {
        views[containerId].forEach((view) => {
            l(`### ${view.name}`);
            l();
            l(`- **ID:** \`${view.id}\``);
            l(`- **Container:** \`${containerId}\``);
            l();
        });
    }
}

// Document configuration properties.
if (configuration) {
    l("## Configuration Properties");
    l();
    for (const key in configuration.properties) {
        const prop = configuration.properties[key];
        const configKey = key.replace("ib-utilities.", "");
        l(`### ${toTitleCase(configKey)}`);
        l();
        l(`${prop.description}`);
        l(`- **Key:** \`${key}\``);
        l();
    }
}

outputFile("README.md");
