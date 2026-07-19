import { Range, Uri } from "vscode";

export function isReviewCommentableDocument(uri: Uri): boolean {
    return uri.scheme === "git";
}

export function reviewCommentingRanges(lineCount: number): Range[] {
    const ranges: Range[] = [];
    for (let line = 0; line < lineCount; line++) {
        ranges.push(new Range(line, 0, line, 0));
    }
    return ranges;
}
