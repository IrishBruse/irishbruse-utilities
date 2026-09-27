/** Stub for a Node-only dynamic import inside `@vscode/diff`. The browser path never calls it. */
export function readFile(): Promise<never> {
    return Promise.reject(new Error("node:fs/promises is unavailable in the markdown editor playground"));
}
