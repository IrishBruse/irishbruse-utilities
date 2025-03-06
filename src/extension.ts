import { ExtensionContext } from "vscode";
import { relativeGoTo } from "./commands/relativeGoTo";
import { openPR } from "./commands/openPR";
import { SnippetViewProvider } from "./views/SnippetView";
import path from "path";
import { registerCommandIB } from "./utils/vscode";
import { Commands } from "./Contributes";

export let UserPath: string = null!;

export function activate(context: ExtensionContext) {
    UserPath = path.join(context.globalStorageUri.path, "../../");

    registerCommandIB(Commands.RelativeGoTo, relativeGoTo, context);
    registerCommandIB(Commands.OpenPR, openPR, context);

    SnippetViewProvider.activate(context);
}

export function deactivate() {}
