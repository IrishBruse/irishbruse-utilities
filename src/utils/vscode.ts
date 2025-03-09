import { commands, ExtensionContext } from "vscode";
import { Commands } from "../constants";

export function registerCommandIB(
    command: Commands,
    callback: (...args: any[]) => any,
    context: ExtensionContext,
    thisArg?: any
) {
    context.subscriptions.push(commands.registerCommand(command, callback, thisArg));
}
