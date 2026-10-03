import { describe, expect, it, vi } from "vitest";
import { killListeningProcess, labelForListener, listListeningPorts } from "./listListeningPorts";

describe("labelForListener", () => {
    it("uses the working directory name", () => {
        expect(labelForListener("MainThread", "/home/econn/git/irishbruse-utilities/src/markdownInline")).toBe(
            "markdownInline"
        );
        expect(labelForListener("MainThread", "/home/econn/dotfiles/dashboard")).toBe("dashboard");
    });

    it("falls back to the process name", () => {
        expect(labelForListener("Discord", undefined)).toBe("Discord");
    });
});

describe("listListeningPorts", () => {
    it("labels listeners from the process working directory", async () => {
        const ports = await listListeningPorts(
            async () => ({
                stdout: `LISTEN 0 511 127.0.0.1:5175 0.0.0.0:* users:(("MainThread",pid=4653,fd=26))\n`,
                stderr: "",
                status: 0,
            }),
            (pid) => (pid === 4653 ? "/home/econn/git/irishbruse-utilities/src/markdownInline" : undefined)
        );

        expect(ports).toEqual([
            {
                port: 5175,
                address: "127.0.0.1:5175",
                pid: 4653,
                processName: "MainThread",
                label: "markdownInline",
            },
        ]);
    });

    it("uses lsof when ss is not installed", async () => {
        const run = vi.fn(async (command: string) => {
            if (command === "ss") {
                const error = new Error("spawn ss ENOENT") as NodeJS.ErrnoException;
                error.code = "ENOENT";
                throw error;
            }
            return {
                stdout: "node 5800 econn 24u IPv4 1 0t0 TCP 127.0.0.1:54321 (LISTEN)\n",
                stderr: "",
                status: 0,
            };
        });

        const ports = await listListeningPorts(run, () => "/home/econn/dotfiles/dashboard");

        expect(ports.map((port) => ({ port: port.port, label: port.label }))).toEqual([
            { port: 54321, label: "dashboard" },
        ]);
    });

    it("hides listeners that have no process id", async () => {
        const ports = await listListeningPorts(async () => ({
            stdout: "LISTEN 0 4096 127.0.0.1:631 0.0.0.0:*\n",
            stderr: "",
            status: 0,
        }));

        expect(ports).toEqual([]);
    });
});

describe("killListeningProcess", () => {
    it("refuses to signal pid 1", () => {
        expect(() => killListeningProcess(1)).toThrow(/Refusing to stop process 1/);
    });

    it("treats an already-exited process as stopped", () => {
        const kill = vi.spyOn(process, "kill").mockImplementation(() => {
            const error = new Error("kill ESRCH") as NodeJS.ErrnoException;
            error.code = "ESRCH";
            throw error;
        });

        expect(() => killListeningProcess(4653)).not.toThrow();
        kill.mockRestore();
    });
});
