import { describe, expect, it } from "vitest";
import { parseLsofListeners, parseSsListeners, portFromAddress } from "./parseListeningPorts";

const SS_SAMPLE = `
LISTEN 0      511        127.0.0.1:54321 0.0.0.0:* users:(("MainThread",pid=5800,fd=24))
LISTEN 0      511        127.0.0.1:5175  0.0.0.0:* users:(("MainThread",pid=4653,fd=26))
LISTEN 0      511            [::1]:5175     [::]:* users:(("MainThread",pid=4653,fd=27))
LISTEN 0      4096   127.0.0.53%lo:53    0.0.0.0:*
LISTEN 0      4096       127.0.0.1:631   0.0.0.0:*
`;

describe("parseSsListeners", () => {
    it("keeps one row per port and prefers a row that has a pid", () => {
        expect(parseSsListeners(SS_SAMPLE)).toEqual([
            {
                port: 53,
                address: "127.0.0.53%lo:53",
                pid: undefined,
                processName: undefined,
            },
            {
                port: 631,
                address: "127.0.0.1:631",
                pid: undefined,
                processName: undefined,
            },
            {
                port: 5175,
                address: "127.0.0.1:5175",
                pid: 4653,
                processName: "MainThread",
            },
            {
                port: 54321,
                address: "127.0.0.1:54321",
                pid: 5800,
                processName: "MainThread",
            },
        ]);
    });
});

describe("parseLsofListeners", () => {
    it("reads the command, pid, and port from lsof", () => {
        const output = [
            "COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME",
            "node     4653 econn   26u  IPv4  12345      0t0  TCP 127.0.0.1:5175 (LISTEN)",
            "node     4653 econn   27u  IPv6  12346      0t0  TCP [::1]:5175 (LISTEN)",
        ].join("\n");

        expect(parseLsofListeners(output)).toEqual([
            {
                port: 5175,
                pid: 4653,
                processName: "node",
                address: "127.0.0.1:5175",
            },
        ]);
    });
});

describe("portFromAddress", () => {
    it("reads the port after the last colon", () => {
        expect(portFromAddress("127.0.0.53%lo:53")).toBe(53);
        expect(portFromAddress("[::1]:5175")).toBe(5175);
        expect(portFromAddress("LISTEN")).toBeUndefined();
    });
});
