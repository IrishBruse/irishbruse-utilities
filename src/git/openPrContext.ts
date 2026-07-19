import { commands, ExtensionContext, Uri, window } from "vscode";
import { getGitApi, getGitApiAsync } from "./getGitApi";
import { getPrInfo } from "./githubUrl";
import { wireGitRepositories } from "./wireGitRepositories";

export const OPEN_PR_REPOS_CONTEXT = "ibUtilitiesOpenPrRepoRoots";
export const HAS_OPEN_PR_CONTEXT = "ibUtilitiesHasOpenPr";

async function refreshOpenPrRepos(): Promise<void> {
    const api = getGitApi() ?? (await getGitApiAsync());
    if (!api) {
        await commands.executeCommand("setContext", OPEN_PR_REPOS_CONTEXT, []);
        await commands.executeCommand("setContext", HAS_OPEN_PR_CONTEXT, false);
        return;
    }

    const roots: Uri[] = [];
    await Promise.all(
        api.repositories.map(async (repository) => {
            const branch = repository.state.HEAD?.name;
            if (!branch) {
                return;
            }
            const pr = await getPrInfo(repository.rootUri.fsPath, branch);
            if (pr) {
                roots.push(repository.rootUri);
            }
        })
    );

    await commands.executeCommand("setContext", OPEN_PR_REPOS_CONTEXT, roots);
    await commands.executeCommand("setContext", HAS_OPEN_PR_CONTEXT, roots.length > 0);
}

export function activateOpenPrContext(context: ExtensionContext): void {
    const refresh = () => void refreshOpenPrRepos();
    void commands.executeCommand("setContext", OPEN_PR_REPOS_CONTEXT, []);
    void commands.executeCommand("setContext", HAS_OPEN_PR_CONTEXT, false);
    context.subscriptions.push(window.onDidChangeActiveTextEditor(() => refresh()));
    wireGitRepositories(context, { onChange: refresh });
}

export function refreshOpenPrContext(): void {
    void refreshOpenPrRepos();
}
