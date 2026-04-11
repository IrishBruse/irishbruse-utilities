import { randomUUID } from "node:crypto";

/**
 * One saved IB Chat session listed in the Chats tree (in-memory until persistence exists).
 */
export type IbChatSessionRecord = {
    id: string;
    title: string;
    createdAt: number;
    agentName?: string;
};

const sessions: IbChatSessionRecord[] = [];

let activeId: string | null = null;

/**
 * Returns sessions in creation order (oldest first).
 */
export function listIbChatSessions(): IbChatSessionRecord[] {
    return [...sessions].sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Returns the session id currently selected for the docked chat view, if any.
 */
export function getActiveIbChatSessionId(): string | null {
    return activeId;
}

/**
 * Marks a session as active for the docked chat UI.
 */
export function setActiveIbChatSessionId(id: string | null): void {
    activeId = id;
}

/**
 * Appends a new session and returns it.
 */
export function addIbChatSession(title: string, options?: { agentName?: string }): IbChatSessionRecord {
    const record: IbChatSessionRecord = {
        id: randomUUID(),
        title,
        createdAt: Date.now(),
        agentName: options?.agentName,
    };
    sessions.push(record);
    return record;
}

/**
 * Removes a session by id and clears active selection when it pointed at that id.
 */
export function removeIbChatSession(id: string): void {
    const index = sessions.findIndex((s) => s.id === id);
    if (index >= 0) {
        sessions.splice(index, 1);
    }
    if (activeId === id) {
        activeId = sessions[0]?.id ?? null;
    }
}
