import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

export type ReviewNoteSide = "LEFT" | "RIGHT";

export type ReviewNote = {
    id: string;
    file: string;
    line: number;
    side: ReviewNoteSide;
    body: string;
    createdAt: string;
    published?: boolean;
};

export type ReviewNotesFile = {
    branch: string;
    baseBranch: string;
    notes: ReviewNote[];
};

function reviewDir(repoRoot: string): string {
    return path.join(repoRoot, ".git", "ib-review");
}

function notesPath(repoRoot: string, branch: string): string {
    const safeBranch = branch.replace(/[/\\]/g, "__");
    return path.join(reviewDir(repoRoot), `${safeBranch}.json`);
}

export async function loadReviewNotes(repoRoot: string, branch: string): Promise<ReviewNotesFile> {
    const filePath = notesPath(repoRoot, branch);
    if (!existsSync(filePath)) {
        return { branch, baseBranch: "", notes: [] };
    }
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as ReviewNotesFile;
}

export async function saveReviewNotes(repoRoot: string, data: ReviewNotesFile): Promise<void> {
    const dir = reviewDir(repoRoot);
    await mkdir(dir, { recursive: true });
    await writeFile(notesPath(repoRoot, data.branch), JSON.stringify(data, null, 2), "utf8");
}

export async function addReviewNote(
    repoRoot: string,
    branch: string,
    baseBranch: string,
    file: string,
    line: number,
    side: ReviewNoteSide,
    body: string
): Promise<ReviewNote> {
    const data = await loadReviewNotes(repoRoot, branch);
    if (!data.baseBranch) {
        data.baseBranch = baseBranch;
    }
    const note: ReviewNote = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        line,
        side,
        body,
        createdAt: new Date().toISOString(),
    };
    data.notes.push(note);
    await saveReviewNotes(repoRoot, data);
    return note;
}

export async function updateReviewNote(
    repoRoot: string,
    branch: string,
    noteId: string,
    body: string
): Promise<ReviewNote | undefined> {
    const data = await loadReviewNotes(repoRoot, branch);
    const note = data.notes.find((n) => n.id === noteId);
    if (!note) {
        return undefined;
    }
    note.body = body;
    await saveReviewNotes(repoRoot, data);
    return note;
}

export async function deleteReviewNote(repoRoot: string, branch: string, noteId: string): Promise<boolean> {
    const data = await loadReviewNotes(repoRoot, branch);
    const before = data.notes.length;
    data.notes = data.notes.filter((n) => n.id !== noteId);
    if (data.notes.length === before) {
        return false;
    }
    await saveReviewNotes(repoRoot, data);
    return true;
}

export async function markNotesPublished(repoRoot: string, branch: string, noteIds: string[]): Promise<void> {
    const data = await loadReviewNotes(repoRoot, branch);
    const idSet = new Set(noteIds);
    for (const note of data.notes) {
        if (idSet.has(note.id)) {
            note.published = true;
        }
    }
    await saveReviewNotes(repoRoot, data);
}

export function formatReviewSummary(data: ReviewNotesFile): string {
    const lines = [`## Review notes (${data.branch} vs ${data.baseBranch || "base"})`, ""];
    const byFile = new Map<string, ReviewNote[]>();
    for (const note of data.notes.filter((n) => !n.published)) {
        const list = byFile.get(note.file) ?? [];
        list.push(note);
        byFile.set(note.file, list);
    }
    for (const [file, notes] of byFile) {
        lines.push(`### ${file}`, "");
        for (const note of notes) {
            lines.push(`- **L${note.line}**: ${note.body}`, "");
        }
    }
    return lines.join("\n").trim();
}

export function countUnpublishedNotes(data: ReviewNotesFile): number {
    return data.notes.filter((n) => !n.published).length;
}
