import { readlinkSync } from "fs";
import path from "path";
import { asyncSpawn, type Process } from "../lib/asyncSpawn/asyncSpawn";
import { parseLsofListeners, parseSsListeners, type ParsedListener } from "./parseListeningPorts";

export type ListeningPort = ParsedListener & {
    label: string;
};

type RunCommand = (command: string, args?: readonly string[]) => Promise<Process>;

export function labelForListener(processName: string | undefined, cwd: string | undefined): string {
    if (cwd) {
        const base = path.basename(cwd);
        if (base && base !== "." && base !== path.sep) {
            return base;
        }
    }

    return processName ?? "";
}

export function readProcCwd(pid: number): string | undefined {
    try {
        return readlinkSync(`/proc/${pid}/cwd`);
    } catch {
        return undefined;
    }
}

export function killListeningProcess(pid: number): void {
    if (!Number.isInteger(pid) || pid <= 1) {
        throw new Error(`Refusing to stop process ${pid}.`);
    }

    try {
        process.kill(pid, "SIGTERM");
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ESRCH") {
            return;
        }
        throw error;
    }
}

export async function listListeningPorts(
    run: RunCommand = asyncSpawn,
    readCwd: (pid: number) => string | undefined = readProcCwd
): Promise<ListeningPort[]> {
    const listeners = await readListeners(run);
    return listeners
        .filter((listener) => listener.pid !== undefined)
        .map((listener) => ({
            ...listener,
            label: labelForListener(listener.processName, readCwd(listener.pid!)),
        }));
}

async function readListeners(run: RunCommand): Promise<ParsedListener[]> {
    try {
        const ss = await run("ss", ["-H", "-ltnp"]);
        if (ss.stdout.trim() || ss.status === 0) {
            return parseSsListeners(ss.stdout);
        }
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") {
            throw error;
        }
    }

    const lsof = await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"]);
    if (lsof.status !== 0 && !lsof.stdout.trim()) {
        throw new Error(lsof.stderr.trim() || "Could not list listening ports.");
    }

    return parseLsofListeners(lsof.stdout);
}
