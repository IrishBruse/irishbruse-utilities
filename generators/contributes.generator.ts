import {
    dedent,
    endDoc,
    getPackage,
    indent,
    inlineDoc,
    l,
    outputFile,
    startDoc,
    stripPackagePrefix,
    toPascalCase,
} from "./generator.js";

const contributes = getPackage().contributes;

// Header.
l("// This file is auto-generated. Do not modify directly.");
l();

// Generate enum for commands.
if (contributes.commands) {
    inlineDoc("Commands");
    l("export enum Commands {");

    indent();

    contributes.commands.forEach((cmd) => {
        const stripped = stripPackagePrefix(cmd.command);
        const constName = toPascalCase(stripped);
        startDoc();
        l(cmd.title);
        l(`Short Title: ${cmd.shortTitle}`);
        l(`Icon: ${cmd.icon}`, !cmd.icon);
        endDoc();
        l(`${constName} = \`${cmd.command}\`,`);
        l();
    });

    if (contributes.viewsContainers && contributes.viewsContainers.activitybar) {
        contributes.viewsContainers.activitybar.forEach((viewContainer) => {
            const constName = toPascalCase(viewContainer.id);
            startDoc();
            l(viewContainer.title);
            endDoc();
            l(`View${constName} = \`workbench.view.${viewContainer.id}\`,`);
            l();
        });
    }

    dedent();

    contributes.viewsContainers.activitybar;
    l(`}`);
    l(``);
}

// Generate enum for view containers.
if (contributes.viewsContainers) {
    inlineDoc("View Containers");
    l("export enum ViewContainers {");
    {
        indent();
        if (contributes.viewsContainers.activitybar) {
            contributes.viewsContainers.activitybar.forEach((container) => {
                const constName = toPascalCase(container.id);
                startDoc();
                l(container.title);
                l(`Icon: ${container.icon}`);
                endDoc();
                l(`  ${constName} = \`${container.id}\`,`);
                l();
            });
        }
        dedent();
    }
    l("}");
    l();
}

// Generate enum for views.
if (contributes.views) {
    inlineDoc("Views");
    l("export enum Views {");
    {
        indent();
        for (const containerId in contributes.views) {
            contributes.views[containerId].forEach((view) => {
                const constName = toPascalCase(view.id);
                startDoc();
                l("Header: " + view.name);
                l(`ContainerId: ${containerId}`);
                endDoc();
                l(`${constName} = \`${view.id}\`,`);
                l();
            });
        }
        dedent();
    }
    l("}");
    l();
}

type Property = {
    type: "object";
    description: string;
    additionalProperties: {
        type: "string";
        description: string;
    };
};

// Generate enum for configuration properties.
if (contributes.configuration) {
    inlineDoc("Configuration Properties");
    l("export enum Configuration {");
    {
        indent();
        for (const key in contributes.configuration.properties) {
            const prop = contributes.configuration.properties[key] as Property;
            const constName = toPascalCase(key.replace(/^ib-utilities\./, ""));
            startDoc();
            l(prop.description);
            endDoc();
            l(`${constName} = \`${key}\`,`);
            l();
        }
        dedent();
    }
    l("}");
    l();
}

outputFile("src/constants.ts");
