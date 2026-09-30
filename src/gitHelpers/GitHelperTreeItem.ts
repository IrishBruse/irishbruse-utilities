import { Command, ThemeIcon, TreeItem, TreeItemCollapsibleState } from "vscode";

export type GitHelperItemKind = "info" | "action";

export class GitHelperTreeItem extends TreeItem {
    public prUrl?: string;
    public checksUrl?: string;
    public reviewUrl?: string;
    public jiraUrl?: string;
    public jiraKey?: string;
    public isDraftPr = false;

    constructor(
        public readonly kind: GitHelperItemKind,
        public readonly repoRoot: string | undefined,
        label: string,
        collapsibleState: TreeItemCollapsibleState,
        id: string,
        public readonly action?:
            | "diffWithBase"
            | "openPr"
            | "createDraftPr"
            | "openPrReview"
            | "openPrChecks"
            | "addJiraKeyToPrTitle"
            | "showChanges",
        description?: string,
        command?: Command
    ) {
        super(label, collapsibleState);
        this.id = id;
        this.description = description;
        this.command = command;
        this.contextValue = action ? `action-${action}` : kind;
        if (action === "diffWithBase") {
            this.iconPath = new ThemeIcon("git-pull-request");
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
