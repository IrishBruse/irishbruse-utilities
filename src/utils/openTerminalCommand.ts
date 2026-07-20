import { TerminalLocation, window } from "vscode";
import type { ActionPanelTerminalMode } from "../actionPanel/types";

export type OpenTerminalCommandOptions = {
    command: string;
    cwd: string;
    name: string;
    terminalMode?: ActionPanelTerminalMode;
};

export function openTerminalCommand(options: OpenTerminalCommandOptions): void {
    const terminalMode = options.terminalMode ?? "panel";
    const terminal = window.createTerminal({
        name: options.name,
        cwd: options.cwd,
        ...(terminalMode === "editor" ? { location: TerminalLocation.Editor } : {}),
    });
    terminal.sendText(options.command, true);
    if (terminalMode !== "background") {
        terminal.show();
    }
}
