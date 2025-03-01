import { ExtensionContext, commands } from "vscode";
import { relativeGoTo } from "./commands/relativeGoTo";
import { openPR } from "./commands/openPR";

export const CommandNamespace = "ib-utilities";

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand(CommandNamespace + ".relativeGoTo", relativeGoTo),
        commands.registerCommand(CommandNamespace + ".openPR", openPR)
    );
}

export function deactivate() {}
