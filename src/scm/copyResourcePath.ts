import { env, SourceControlResourceState, Uri, workspace } from "vscode";
import { gitRepositoryRootForUri, gitRepositoryRootForUriSync, pathLooksRelative, relativePathFromRepoRoot } from "../git/gitRepositoryRoot";
import { parseGitDocumentUri } from "../git/gitDocument";

/** Workbench SCM items use `sourceUri`; extension API uses `resourceUri`. */
type ScmResourceLike =
    | SourceControlResourceState
    | {
          sourceUri?: Uri;
          resourceUri?: Uri;
          resourceGroup?: { provider?: { rootUri?: Uri } };
      };

export type ScmResourceContext = {
    uri: Uri;
    repoRoot?: string;
};

function isUriLike(value: unknown): value is Uri {
    return (
        typeof value === "object" &&
        value !== null &&
        "scheme" in value &&
        "fsPath" in value &&
        typeof (value as Uri).fsPath === "string"
    );
}

function coerceUri(value: unknown): Uri | undefined {
    if (!value) {
        return undefined;
    }
    if (isUriLike(value)) {
        return value;
    }
    if (typeof value === "object" && "scheme" in value && "path" in value) {
        const components = value as { scheme: string; path: string; fsPath?: string; query?: string };
        return {
            scheme: components.scheme,
            path: components.path,
            fsPath: components.fsPath ?? components.path,
            query: components.query ?? "",
        } as Uri;
    }
    return undefined;
}

export function resolveFileUri(uri: Uri): Uri {
    const parsed = parseGitDocumentUri(uri);
    if (parsed) {
        return Uri.file(parsed.filePath);
    }
    if (uri.scheme === "file") {
        return uri;
    }
    return uri;
}

function repoRootFromScmResource(resource: ScmResourceLike | Record<string, unknown>): string | undefined {
    const rootUri = (resource as { resourceGroup?: { provider?: { rootUri?: Uri } } }).resourceGroup?.provider
        ?.rootUri;
    return rootUri ? resolveFileUri(rootUri).fsPath : undefined;
}

function scmResourceContextFromArg(arg: unknown): ScmResourceContext | undefined {
    if (isUriLike(arg)) {
        return { uri: resolveFileUri(arg) };
    }
    if (!arg || typeof arg !== "object") {
        return undefined;
    }
    const resource = arg as ScmResourceLike & Record<string, unknown>;
    const resourceUri =
        coerceUri("resourceUri" in resource ? resource.resourceUri : undefined) ??
        coerceUri("sourceUri" in resource ? resource.sourceUri : undefined);
    if (!resourceUri) {
        return undefined;
    }
    return {
        uri: resolveFileUri(resourceUri),
        repoRoot: repoRootFromScmResource(resource),
    };
}

export function normalizeScmResources(
    state?: ScmResourceLike | ScmResourceLike[] | Uri | Uri[]
): ScmResourceContext[] {
    if (!state) {
        return [];
    }
    const items = Array.isArray(state) ? state : [state];
    return items.map(scmResourceContextFromArg).filter((item): item is ScmResourceContext => item !== undefined);
}

export function pathsFromScmResources(resources: ScmResourceContext[]): string[] {
    return resources.map((item) => item.uri.fsPath);
}

export function relativePathForScmResource(resource: ScmResourceContext, resolvedRepoRoot?: string): string {
    const absolutePath = resource.uri.fsPath;
    const workspaceRelative = workspace.asRelativePath(resource.uri, false).replace(/\\/g, "/");
    if (pathLooksRelative(workspaceRelative, absolutePath)) {
        return workspaceRelative;
    }

    const repoRoot = resolvedRepoRoot ?? resource.repoRoot ?? gitRepositoryRootForUriSync(resource.uri);
    if (repoRoot) {
        const repoRelative = relativePathFromRepoRoot(resource.uri, repoRoot);
        if (pathLooksRelative(repoRelative, absolutePath)) {
            return repoRelative;
        }
    }

    return workspaceRelative;
}

export async function relativePathsForScmResources(resources: ScmResourceContext[]): Promise<string[]> {
    return Promise.all(
        resources.map(async (resource) => {
            const repoRoot =
                resource.repoRoot ??
                gitRepositoryRootForUriSync(resource.uri) ??
                (await gitRepositoryRootForUri(resource.uri));
            return relativePathForScmResource(resource, repoRoot);
        })
    );
}

export async function copyScmResourcePath(
    state?: ScmResourceLike | ScmResourceLike[] | Uri | Uri[]
): Promise<void> {
    const paths = pathsFromScmResources(normalizeScmResources(state));
    if (!paths.length) {
        return;
    }
    await env.clipboard.writeText(paths.join("\n"));
}

export async function copyScmResourceRelativePath(
    state?: ScmResourceLike | ScmResourceLike[] | Uri | Uri[]
): Promise<void> {
    const resources = normalizeScmResources(state);
    const paths = await relativePathsForScmResources(resources);
    if (!paths.length) {
        return;
    }
    await env.clipboard.writeText(paths.join("\n"));
}
