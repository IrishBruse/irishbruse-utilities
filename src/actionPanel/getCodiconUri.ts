import { Uri, type ExtensionContext } from "vscode";

export type CodiconIconPath = {
    light: Uri;
    dark: Uri;
};

export function getCodiconUri(context: ExtensionContext, icon: string): CodiconIconPath | undefined {
    if (!icon) {
        return undefined;
    }

    return {
        light: Uri.joinPath(context.extensionUri, "media", "codicons", "light", `${icon}.svg`),
        dark: Uri.joinPath(context.extensionUri, "media", "codicons", "dark", `${icon}.svg`),
    };
}
