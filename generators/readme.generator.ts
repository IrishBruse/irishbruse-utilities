import { l, toTitleCase, getPackage, outputFile } from "./generator.js";

const pkg = getPackage();
const contributes = pkg.contributes;

const { commands, configuration, views, viewsContainers, menus, themes } = contributes;

l(`# ${pkg.displayName || pkg.name} Contributions`);
l();
l(`${pkg.description}`);
l();

// Document commands.
if (commands) {
    l("## Commands");
    l();
    for (const cmd of commands) {
        l(`### ${cmd.title}`);
        l();
        l(`![${cmd.command} Screenshot](docs/commands/${cmd.command}.png)`);
        l();
        l(`-   **Command:** \`${cmd.command}\``);
        l(`-   **Short Title:** ${cmd.shortTitle}`);
        l(`-   **Icon:** ${cmd.icon}`, cmd.icon);
        l();
    }
}

// Document view containers.
if (viewsContainers && viewsContainers.activitybar) {
    l("## View Containers");
    l();
    for (const container of viewsContainers.activitybar) {
        l(`### ${container.title}`);
        l();
        l(`-   **ID:** \`${container.id}\``);
        l(`-   **Icon:** [${container.icon}](${container.icon})`);
        l();
    }
}

// Document views.
if (views) {
    l("## Views");
    l();
    for (const containerId in views) {
        views[containerId].forEach((view) => {
            l(`### ${view.name}`);
            l();
            l(`-   **ID:** \`${view.id}\``);
            l(`-   **Container:** \`${containerId}\``);
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
        l(`-   **Key:** \`${key}\``);
        l();
    }
}

// Document menus.
if (menus) {
    l("## Menus");
    l();
    for (const menu in menus) {
        l(`### ${toTitleCase(menu.replace(/:/g, " "))}`);
        l();
        for (const item of menus[menu]) {
            l(`- **Command:** \`${item.command}\``);
            l(`  - **Condition:** \`${item.when}\``);
            l(`  - **Group:** \`${item.group}\``);
            l();
        }
    }
}

// Document themes.
if (themes) {
    l("## Themes");
    l();
    for (const theme of themes) {
        l(`### ${theme.label}`);
        l();
        l(`- **ID:** \`${theme.id}\``, theme.id);
        l(`- **Name:** \`${theme.label}\``);
        l(`- **Base Theme:** \`${theme.uiTheme}\``);
        l();
    }
}

outputFile("README.md");
