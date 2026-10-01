import { commands } from "vscode";
import { clipboardHasImage } from "../clipboard/detectImage";


const TERMINAL_IMAGE_PASTE_SEQUENCE = "\x16";

export async function terminalPaste(): Promise<void> {
    if ((await clipboardHasImage()) === true) {
        await commands.executeCommand("workbench.action.terminal.sendSequence", {
            text: TERMINAL_IMAGE_PASTE_SEQUENCE,
        });
        return;
    }

    await commands.executeCommand("workbench.action.terminal.paste");
}
