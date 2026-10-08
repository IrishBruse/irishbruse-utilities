import { spawn, SpawnOptionsWithoutStdio } from "child_process";

export type Process = {
    stdout: string;
    stderr: string;
    status: number | null;
};


export type AsyncSpawnOptions = SpawnOptionsWithoutStdio & {
    input?: string;
};

export async function asyncSpawn(
    command: string,
    args: readonly string[] = [],
    options: AsyncSpawnOptions = {}
): Promise<Process> {
    const { input, ...spawnOptions } = options;
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, spawnOptions);
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

        if (input !== undefined) {
            child.stdin.write(input);
            child.stdin.end();
        }
    });
}
