import { access, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { workspace } from "vscode";

const DEFAULT_KEY_PATTERN = "[A-Z][A-Z0-9_]*-\\d+";

export type BoardTicket = {
    key: string;
    summary: string;
    assignee: string;
    stageSince?: string;
};

type StatusBucket = "todo" | "inProgress" | "codeReview" | "inTest" | "done";

type BoardSection = {
    heading: string;
    statuses: Record<StatusBucket, BoardTicket[]>;
};

type BoardSections = {
    myTickets: BoardSection;
    teammates: BoardSection;
    unassigned: BoardSection;
    misc: BoardSection;
};

export type SyncedJiraBoard = {
    syncedAt: string;
    sections: BoardSections;
};

export type JiraWorkspace = {
    baseUrl: string;
    keyPattern: RegExp;
    board: SyncedJiraBoard;
};

const STATUS_BUCKETS: StatusBucket[] = ["todo", "inProgress", "codeReview", "inTest", "done"];
const SECTION_KEYS: (keyof BoardSections)[] = ["myTickets", "teammates", "unassigned", "misc"];

export function jiraConfigDir(): string {
    return path.join(os.homedir(), ".config", "jira");
}

export function jiraBoardCachePath(): string {
    return path.join(jiraConfigDir(), "board.json");
}

function parseBoardTicket(value: unknown): BoardTicket | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const raw = value as Record<string, unknown>;
    if (typeof raw.key !== "string" || !raw.key.trim()) {
        return null;
    }
    if (typeof raw.summary !== "string") {
        return null;
    }
    if (typeof raw.assignee !== "string") {
        return null;
    }
    const ticket: BoardTicket = {
        key: raw.key.trim(),
        summary: raw.summary,
        assignee: raw.assignee,
    };
    if (typeof raw.stageSince === "string" && raw.stageSince.trim()) {
        ticket.stageSince = raw.stageSince.trim();
    }
    return ticket;
}

function parseBoardSection(value: unknown): BoardSection | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const raw = value as Record<string, unknown>;
    if (typeof raw.heading !== "string") {
        return null;
    }
    if (!raw.statuses || typeof raw.statuses !== "object" || Array.isArray(raw.statuses)) {
        return null;
    }
    const statusesRaw = raw.statuses as Record<string, unknown>;
    const statuses = {} as Record<StatusBucket, BoardTicket[]>;
    for (const bucket of STATUS_BUCKETS) {
        const rows = statusesRaw[bucket];
        if (!Array.isArray(rows)) {
            return null;
        }
        const tickets: BoardTicket[] = [];
        for (const row of rows) {
            const ticket = parseBoardTicket(row);
            if (!ticket) {
                return null;
            }
            tickets.push(ticket);
        }
        statuses[bucket] = tickets;
    }
    return { heading: raw.heading, statuses };
}

function parseBoardSections(value: unknown): BoardSections | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const raw = value as Record<string, unknown>;
    const sections = {} as BoardSections;
    for (const key of SECTION_KEYS) {
        const section = parseBoardSection(raw[key]);
        if (!section) {
            return null;
        }
        sections[key] = section;
    }
    return sections;
}

export function parseSyncedJiraBoard(content: string): SyncedJiraBoard | null {
    try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (typeof parsed.syncedAt !== "string") {
            return null;
        }
        const sections = parseBoardSections(parsed.sections);
        if (!sections) {
            return null;
        }
        return {
            syncedAt: parsed.syncedAt,
            sections,
        };
    } catch {
        return null;
    }
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | undefined> {
    try {
        const content = await readFile(filePath, "utf8");
        const parsed = JSON.parse(content) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return undefined;
        }
        return parsed as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

export async function readSyncedJiraBoard(): Promise<SyncedJiraBoard | null> {
    try {
        const content = await readFile(jiraBoardCachePath(), "utf8");
        return parseSyncedJiraBoard(content);
    } catch {
        return null;
    }
}

function normalizeSiteHost(site: string): string {
    return site.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function readJiraSite(): Promise<string | undefined> {
    const configDir = jiraConfigDir();
    const config = await readJsonFile(path.join(configDir, "config.json"));
    const configSite = typeof config?.site === "string" ? config.site.trim() : "";
    if (configSite) {
        return configSite;
    }

    const info = await readJsonFile(path.join(configDir, "info.json"));
    const infoSite = typeof info?.site === "string" ? info.site.trim() : "";
    return infoSite || undefined;
}

function resolveKeyPattern(): RegExp | undefined {
    const patternSource =
        workspace.getConfiguration("ib-utilities").get<string>("jira.keyPattern")?.trim() || DEFAULT_KEY_PATTERN;
    try {
        return new RegExp(patternSource);
    } catch {
        return undefined;
    }
}

export function findBoardTicket(board: SyncedJiraBoard, issueKey: string): BoardTicket | undefined {
    const normalizedKey = issueKey.toUpperCase();
    for (const sectionKey of SECTION_KEYS) {
        const section = board.sections[sectionKey];
        for (const bucket of STATUS_BUCKETS) {
            const ticket = section.statuses[bucket].find((row) => row.key.toUpperCase() === normalizedKey);
            if (ticket) {
                return ticket;
            }
        }
    }
    return undefined;
}

export function getJiraBrowseUrl(baseUrl: string, key: string): string {
    const host = normalizeSiteHost(baseUrl);
    return `https://${host}/browse/${key}`;
}

export function getJiraKeyPattern(): RegExp | undefined {
    return resolveKeyPattern();
}

export async function getJiraWorkspace(): Promise<JiraWorkspace | undefined> {
    const board = await readSyncedJiraBoard();
    if (!board) {
        return undefined;
    }

    const site = await readJiraSite();
    if (!site) {
        return undefined;
    }

    const keyPattern = resolveKeyPattern();
    if (!keyPattern) {
        return undefined;
    }

    return {
        baseUrl: site,
        keyPattern,
        board,
    };
}

export async function jiraBoardCacheExists(): Promise<boolean> {
    try {
        await access(jiraBoardCachePath());
        return true;
    } catch {
        return false;
    }
}
