export type ParsedListener = {
    port: number;
    pid?: number;
    processName?: string;
    address: string;
};

const PROCESS_PATTERN = /\("([^"]+)",pid=(\d+)/;

export function parseSsListeners(output: string): ParsedListener[] {
    const byPort = new Map<number, ParsedListener>();

    for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("LISTEN")) {
            continue;
        }

        const local = trimmed.split(/\s+/)[3];
        const port = local ? portFromAddress(local) : undefined;
        if (port === undefined || !local) {
            continue;
        }

        const processMatch = PROCESS_PATTERN.exec(trimmed);
        const listener: ParsedListener = {
            port,
            address: local,
            pid: processMatch ? Number(processMatch[2]) : undefined,
            processName: processMatch?.[1],
        };
        const existing = byPort.get(port);
        if (!existing || (existing.pid === undefined && listener.pid !== undefined)) {
            byPort.set(port, listener);
        }
    }

    return sortListeners(byPort);
}

export function parseLsofListeners(output: string): ParsedListener[] {
    const byPort = new Map<number, ParsedListener>();

    for (const line of output.split("\n")) {
        if (!line.includes("(LISTEN)")) {
            continue;
        }

        const parts = line.trim().split(/\s+/);
        const processName = parts[0];
        const pid = Number(parts[1]);
        const address = parts.find((part) => portFromAddress(part) !== undefined);
        const port = address ? portFromAddress(address) : undefined;
        if (!processName || !Number.isInteger(pid) || pid <= 0 || port === undefined || !address) {
            continue;
        }

        if (!byPort.has(port)) {
            byPort.set(port, { port, pid, processName, address });
        }
    }

    return sortListeners(byPort);
}

export function portFromAddress(address: string): number | undefined {
    const colon = address.lastIndexOf(":");
    if (colon < 0) {
        return undefined;
    }

    const raw = address.slice(colon + 1);
    if (!/^\d+$/.test(raw)) {
        return undefined;
    }

    const port = Number(raw);
    if (port < 1 || port > 65535) {
        return undefined;
    }

    return port;
}

function sortListeners(byPort: Map<number, ParsedListener>): ParsedListener[] {
    return [...byPort.values()].sort((left, right) => left.port - right.port);
}
