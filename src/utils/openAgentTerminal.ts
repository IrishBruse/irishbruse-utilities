import { TerminalLocation, window } from "vscode";

export function openAgentInEditorTerminal(prompt: string, cwd: string, name: string): void {
    const terminal = window.createTerminal({
        name,
        cwd,
        location: TerminalLocation.Editor,
    });
    terminal.show();
    terminal.sendText(`agent ${JSON.stringify(prompt)}`, true);
}
