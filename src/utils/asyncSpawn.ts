import { spawn, SpawnOptionsWithoutStdio } from "child_process";

export type Process = {
    stdout: string;
    stderr: string;
    status: number | null;
};

/**
 * Asynchronously spawns a child process and returns a Promise.
 *
 * @param {string} command - The command to execute.
 * @param {string[]} args - An array of command-line arguments.
 * @param {object} options - Options to pass to child_process.spawn.
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>} - A Promise that resolves with the stdout, stderr, and exit code.
 */
export async function asyncSpawn(
    command: string,
    args: readonly string[] = [],
    options: SpawnOptionsWithoutStdio = {}
): Promise<Process> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, options);
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data) => {
            stdout += data;
        });

        child.stderr.on("data", (data) => {
            stderr += data;
        });

        child.on("close", (code) => {
            resolve({ stdout, stderr, status: code });
        });

        child.on("error", (err) => {
            reject(err);
        });
    });
}
