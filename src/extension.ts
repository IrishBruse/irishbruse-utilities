import { ExtensionContext, commands } from "vscode";
import { relativeGoTo } from "./commands/relativeGoTo";
import { runExternalCommand } from "./commands/runExternalCommand";

export const CommandNamespace = "ib-utilities";

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand(CommandNamespace + ".runExternalCommand", runExternalCommand),
        commands.registerCommand(CommandNamespace + ".relativeGoTo", relativeGoTo)
    );
}

export function deactivate() {}
