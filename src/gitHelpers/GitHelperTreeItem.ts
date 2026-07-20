import { Command, ThemeIcon, TreeItem, TreeItemCollapsibleState } from "vscode";
import type { DiffChange } from "../git/gitApi";

export type GitHelperItemKind = "info" | "action" | "changesFolder" | "changesFile";

export class GitHelperTreeItem extends TreeItem {
    public prUrl?: string;
    public checksUrl?: string;
    public reviewUrl?: string;
    public jiraUrl?: string;
    public jiraKey?: string;
    public isDraftPr = false;
    public mergeBaseRef?: string;
    public relativePath?: string;
    public diffChange?: DiffChange;

    constructor(
        public readonly kind: GitHelperItemKind,
        public readonly repoRoot: string | undefined,
        label: string,
        collapsibleState: TreeItemCollapsibleState,
        id: string,
        public readonly action?:
            | "diffWithBase"
            | "publishReview"
            | "openPr"
            | "createDraftPr"
            | "openPrReview"
            | "openPrChecks"
            | "addJiraKeyToPrTitle"
            | "showChanges",
        description?: string,
        command?: Command,
        mergeBaseRef?: string,
        relativePath?: string,
        diffChange?: DiffChange
    ) {
        super(label, collapsibleState);
        this.id = id;
        this.description = description;
        this.command = command;
        this.mergeBaseRef = mergeBaseRef;
        this.relativePath = relativePath;
        this.diffChange = diffChange;
        this.contextValue = action ? `action-${action}` : kind;
        if (action === "diffWithBase") {
            this.iconPath = new ThemeIcon("git-pull-request");
        } else if (action === "publishReview") {
            this.iconPath = new ThemeIcon("comment-discussion");
        } else if (action === "openPr") {
            this.iconPath = new ThemeIcon("git-pull-request");
        } else if (action === "createDraftPr") {
            this.iconPath = new ThemeIcon("git-pull-request-create");
        } else if (action === "openPrReview") {
            this.iconPath = new ThemeIcon("comment-discussion");
        } else if (action === "openPrChecks") {
            this.iconPath = new ThemeIcon("run-all");
        } else if (action === "addJiraKeyToPrTitle") {
            this.iconPath = new ThemeIcon("warning");
        } else if (action === "showChanges") {
            this.iconPath = new ThemeIcon("git-compare");
        }
    }
}
