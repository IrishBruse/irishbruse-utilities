import { commands, ExtensionContext } from "vscode";
import { Commands } from "../../constants";

export function registerCommandIB(
    command: Commands,
    callback: Parameters<typeof commands.registerCommand>[1],
    context: ExtensionContext,
    thisArg?: Parameters<typeof commands.registerCommand>[2],
) {
    context.subscriptions.push(commands.registerCommand(command, callback, thisArg));
}
