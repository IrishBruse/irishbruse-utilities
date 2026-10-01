import {
    dedent,
    getPackage,
    indent,
    l,
    outputFile,
    stripPackagePrefix,
    toPascalCase,
} from "./generator.ts";

const contributes = getPackage().contributes;

if (contributes.commands) {
    l("export enum Commands {");

    indent();

    contributes.commands.forEach((cmd) => {
        const stripped = stripPackagePrefix(cmd.command);
        const constName = toPascalCase(stripped);
        l(`${constName} = \`${cmd.command}\`,`);
        l();
    });

    if (contributes.viewsContainers && contributes.viewsContainers.activitybar) {
        contributes.viewsContainers.activitybar.forEach((viewContainer) => {
            const constName = toPascalCase(viewContainer.id);
            l(`View${constName} = \`workbench.view.${viewContainer.id}\`,`);
            l();
        });
    }

    dedent();

    contributes.viewsContainers.activitybar;
    l(`}`);
    l(``);
}

if (contributes.viewsContainers) {
    l("export enum ViewContainers {");
    {
        indent();
        if (contributes.viewsContainers.activitybar) {
            contributes.viewsContainers.activitybar.forEach((container) => {
                const constName = toPascalCase(container.id);
                l(`  ${constName} = \`${container.id}\`,`);
                l();
            });
        }
        if (contributes.viewsContainers.panel) {
            contributes.viewsContainers.panel.forEach((container) => {
                const constName = toPascalCase(container.id);
                l(`  ${constName} = \`${container.id}\`,`);
                l();
            });
        }
        dedent();
    }
    l("}");
    l();
}

if (contributes.views) {
    l("export enum Views {");
    {
        indent();
        for (const containerId in contributes.views) {
            contributes.views[containerId].forEach((view) => {
                const constName = toPascalCase(view.id);
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

if (contributes.configuration) {
    l("export enum Configuration {");
    {
        indent();
        for (const key in contributes.configuration.properties) {
            const constName = toPascalCase(key.replace(/^ib-utilities\./, ""));
            l(`${constName} = \`${key}\`,`);
            l();
        }
        dedent();
    }
    l("}");
    l();
}

if (contributes.languages && contributes.languages.length > 0) {
    l("export const contributedLanguageIdToExtension: Record<string, string> = {");
    indent();
    for (const lang of contributes.languages) {
        const primaryExtension = lang.extensions?.[0];
        if (!primaryExtension) {
            continue;
        }
        l(`${JSON.stringify(lang.id)}: ${JSON.stringify(primaryExtension)},`);
    }
    dedent();
    l("};");
    l();
}

outputFile("src/constants.ts");
