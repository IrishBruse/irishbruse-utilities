import type { ExtensionContext } from "vscode";
import type { API, Repository } from "./gitApi";
import { getGitApi, getGitApiAsync } from "./getGitApi";

export type WireGitRepositoriesOptions = {
    onChange: () => void;
};

export function wireGitRepositories(context: ExtensionContext, options: WireGitRepositoriesOptions): void {
    const tracked = new WeakSet<Repository>();

    const trackRepository = (repository: Repository): void => {
        if (tracked.has(repository)) {
            return;
        }
        tracked.add(repository);
        context.subscriptions.push(repository.state.onDidChange(options.onChange));
        context.subscriptions.push(repository.ui.onDidChange(options.onChange));
    };

    const syncRepositories = (api: API): void => {
        for (const repository of api.repositories) {
            trackRepository(repository);
        }
        options.onChange();
    };

    const wireApi = (api: API): void => {
        context.subscriptions.push(api.onDidChangeState(() => syncRepositories(api)));
        context.subscriptions.push(
            api.onDidOpenRepository((event) => {
                trackRepository(event.repository);
                options.onChange();
            })
        );
        context.subscriptions.push(api.onDidCloseRepository(() => options.onChange()));
        syncRepositories(api);
    };

    const api = getGitApi();
    if (api) {
        wireApi(api);
    } else {
        void getGitApiAsync().then((loaded) => {
            if (loaded) {
                wireApi(loaded);
            }
        });
    }
}
