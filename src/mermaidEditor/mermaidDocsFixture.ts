import { join } from "node:path";
import { fileURLToPath } from "node:url";

const docsMermaidDir = fileURLToPath(new URL("../../docs/mermaid", import.meta.url));

export function mermaidDocsFixturePath(...segments: string[]): string {
    return join(docsMermaidDir, ...segments);
}
