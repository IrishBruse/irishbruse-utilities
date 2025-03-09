import { l, toTitleCase, getPackage, outputFile } from "./generator.js";

const pkg = getPackage();
const contributes = pkg.contributes;

function iconToImage(icon?: string) {
    if (!icon) {
        return "";
    }
    icon = icon.slice(2, -1);

    return `![#ABB2BF](https://raw.githubusercontent.com/microsoft/vscode-codicons/refs/heads/main/src/icons/${icon}.svg)`;
}

const { commands, configuration, menus, themes, views, viewsContainers } = contributes;

l(`# ${pkg.displayName || pkg.name} Contributions`);
l();
l(`${pkg.description}`);
l();

// Document commands.
if (commands) {
    l("## Commands");
    l();
    commands.forEach((cmd) => {
        l(`### ${cmd.title}`);
        l();
        l(`![${cmd.command} Screenshot](docs/commands/${cmd.command}.png)`);
        l();
        l(`- **Command:** \`${cmd.command}\``);
        l(`- **Short Title:** ${cmd.shortTitle}`);
        l(`- **Icon:** ${iconToImage(cmd.icon)}`, !cmd.icon);
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
