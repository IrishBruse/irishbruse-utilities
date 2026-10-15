import { emitKeypressEvents } from "node:readline";
import { stdin as input, stdout as output } from "node:process";

const cyan = "\u001b[36m";
const bold = "\u001b[1m";
const resetCyan = "\u001b[39m";
const resetBold = "\u001b[22m";
const hideCursor = "\u001b[?25l";
const showCursor = "\u001b[?25h";
const eraseDown = "\u001b[J";

function cursorUp(count) {
    return count > 0 ? `\u001b[${count}A` : "";
}

function clear(lineCount) {
    if (lineCount > 0) {
        output.write(`${cursorUp(lineCount)}${eraseDown}`);
    }
}

export async function select(message, choices) {
    let active = 0;
    let printedLines = 0;

    const buildLines = () => [
        message,
        ...choices.map((choice, index) => {
            const pointer = index === active ? `${cyan}\u276f${resetCyan}` : " ";
            const label = index === active ? `${bold}${choice.label}${resetBold}` : choice.label;
            return `${pointer} ${label}`;
        }),
    ];

    return new Promise((resolve) => {
        const wasRaw = input.isRaw ?? false;

        emitKeypressEvents(input);
        input.setRawMode(true);
        input.resume();
        output.write(hideCursor);

        const render = () => {
            clear(printedLines);
            const lines = buildLines();
            output.write(`${lines.join("\n")}\n`);
            printedLines = lines.length;
        };

        const cleanup = () => {
            input.off("keypress", onKeypress);
            input.setRawMode(wasRaw);
            input.pause();
            output.write(showCursor);
        };

        const finish = (choice) => {
            clear(printedLines);
            cleanup();
            output.write(`${message} ${cyan}${choice.label}${resetCyan}\n`);
            resolve(choice.value);
        };

        const onKeypress = (_str, key) => {
            if (key.ctrl && key.name === "c") {
                clear(printedLines);
                cleanup();
                output.write("\n");
                process.exit(130);
            }

            if (key.name === "up" || key.name === "k") {
                active = (active - 1 + choices.length) % choices.length;
                render();
                return;
            }

            if (key.name === "down" || key.name === "j") {
                active = (active + 1) % choices.length;
                render();
                return;
            }

            if (key.name === "return" || key.name === "enter") {
                finish(choices[active]);
            }
        };

        render();
        input.on("keypress", onKeypress);
    });
}
