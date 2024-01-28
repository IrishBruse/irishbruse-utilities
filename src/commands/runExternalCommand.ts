import { exec } from "child_process";
import { window, workspace } from "vscode";
import { CommandNamespace } from "../extension";

type CommandArgs = {
    command: string;
};

export async function runExternalCommand(args: CommandArgs) {
    if (!args.command) {
        window.showErrorMessage("No command provided.");
        return;
    }

    if (!workspace.workspaceFolders || !workspace.workspaceFolders[0].uri.fsPath) {
        window.showErrorMessage("No workspace folders open.");
        return;
    }

    const config = workspace.getConfiguration(CommandNamespace);

    let terminalCommand = config.get<string>("externalTerminalCommand", "");

    if (terminalCommand) {
        terminalCommand = terminalCommand?.replaceAll("${workspaceFolder}", workspace.workspaceFolders[0].uri.fsPath);
    }

    let command = terminalCommand + " " + args.command;

    exec(command, (err, stdout, stderr) => {
        if (stdout) {
            window.showInformationMessage("stdout: " + stdout);
        }
        if (err) {
            window.showErrorMessage("Error running command: " + err + "\n" + stderr);
        }
    });
}
