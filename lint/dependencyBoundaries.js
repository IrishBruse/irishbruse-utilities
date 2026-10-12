import { statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { definePlugin, defineRule } from "vite-plus/lint/plugins";

const toPosix = (value) => value.split(sep).join("/");

const isDirectory = (value) => {
    try {
        return statSync(value).isDirectory();
    } catch {
        return false;
    }
};

const isFile = (value) => {
    try {
        return statSync(value).isFile();
    } catch {
        return false;
    }
};

const resolveImport = (filename, source) => {
    if (typeof source !== "string" || !source.startsWith(".")) {
        return undefined;
    }
    const absolute = resolve(dirname(filename), source);
    if (isFile(`${absolute}.ts`)) {
        return { posix: toPosix(`${absolute}.ts`) };
    }
    const target = isDirectory(absolute) ? `${absolute}${sep}index` : absolute;
    return { posix: toPosix(target) };
};

const within = (value, folder) => value === folder || value.startsWith(`${folder}/`);

const privateImport = (target, packageRoot) => {
    if (!target.posix.startsWith(`${packageRoot}/`)) {
        return false;
    }
    return target.posix.slice(packageRoot.length + 1).includes("/");
};

const optionsSchema = {
    type: "object",
    additionalProperties: true,
};

const isExcluded = (posix, options) => {
    const extensions = options.excludeExtensions ?? [];
    const folders = options.excludeFolders ?? [];
    if (extensions.some((extension) => posix.endsWith(extension))) {
        return true;
    }
    const segments = posix.split("/");
    return folders.some((folder) => segments.includes(folder));
};

const visitSources = (onSource) => {
    const handle = (node) => {
        const source = node.source;
        if (source?.type === "Literal" && typeof source.value === "string") {
            onSource(source.value, source);
        }
    };
    return {
        ImportDeclaration: handle,
        ExportNamedDeclaration: handle,
        ExportAllDeclaration: handle,
        ImportExpression: handle,
    };
};

const makeRule = (messages, check) =>
    defineRule({
        meta: { type: "problem", messages, schema: [optionsSchema] },
        create(context) {
            const options = context.options[0] ?? {};
            const filename = toPosix(context.filename);
            const root = toPosix(resolve(context.cwd, options.packagesRoot ?? "src"));
            return visitSources((source, node) => {
                const target = resolveImport(context.filename, source);
                if (!target || isExcluded(target.posix, options)) {
                    return;
                }
                const diagnostic = check({ filename, root, target, options });
                if (diagnostic) {
                    context.report({ node, ...diagnostic });
                }
            });
        },
    });

const entryPointBoundary = makeRule(
    {
        entryPoint: "Import the {{package}} entry point instead of a private folder.",
    },
    ({ filename, root, target, options }) => {
        for (const name of options.packages ?? []) {
            const packageRoot = `${root}/${name}`;
            if (privateImport(target, packageRoot) && !within(filename, packageRoot)) {
                return { messageId: "entryPoint", data: { package: name } };
            }
        }
        return undefined;
    },
);

const noCrossFeature = makeRule(
    {
        crossFeature:
            "Feature folders do not import sibling folders. Move shared code to src/lib and wire commands from src/commands.",
    },
    ({ filename, root, target, options }) => {
        const features = options.features ?? [];
        const from = features.find((name) => within(filename, `${root}/${name}`));
        if (!from) {
            return undefined;
        }
        const to = features.find(
            (name) => name !== from && within(target.posix, `${root}/${name}`),
        );
        if (!to) {
            return undefined;
        }
        return { messageId: "crossFeature" };
    },
);

const testsThroughEntrypoints = makeRule(
    {
        testsEntryPoint: "Tests reach {{package}} through its entry point, not a private folder.",
    },
    ({ filename, root, target, options }) => {
        const testsFolder = options.testsFolder ?? "tests";
        const packages = options.packages ?? [];
        const from = packages.find((name) => within(filename, `${root}/${name}/${testsFolder}`));
        if (!from) {
            return undefined;
        }
        if (within(target.posix, `${root}/${from}/${testsFolder}`)) {
            return undefined;
        }
        for (const name of packages) {
            if (privateImport(target, `${root}/${name}`)) {
                return { messageId: "testsEntryPoint", data: { package: name } };
            }
        }
        return undefined;
    },
);

const playgroundThroughEntrypoints = makeRule(
    {
        playgroundEntryPoint:
            "The playground reaches {{package}} through its entry point, not a private folder.",
    },
    ({ filename, root, target, options }) => {
        const playgroundFolder = options.playgroundFolder ?? "playground";
        const packages = options.packages ?? [];
        const from = packages.find((name) =>
            within(filename, `${root}/${name}/${playgroundFolder}`),
        );
        if (!from) {
            return undefined;
        }
        if (within(target.posix, `${root}/${from}/${playgroundFolder}`)) {
            return undefined;
        }
        for (const name of packages) {
            if (privateImport(target, `${root}/${name}`)) {
                return { messageId: "playgroundEntryPoint", data: { package: name } };
            }
        }
        return undefined;
    },
);

const libContained = makeRule(
    {
        libContained: "{{package}} {{folder}}/ stays inside the package except the shared roots.",
    },
    ({ filename, root, target, options }) => {
        const contained = options.contained ?? {};
        const name = contained.package;
        const folder = contained.folder;
        if (!name || !folder) {
            return undefined;
        }
        if (!within(filename, `${root}/${name}/${folder}`)) {
            return undefined;
        }
        if (!target.posix.startsWith(`${root}/`)) {
            return undefined;
        }
        if (within(target.posix, `${root}/${name}`)) {
            return undefined;
        }
        const shared = contained.sharedRoots ?? [];
        if (shared.some((sharedRoot) => within(target.posix, `${root}/${sharedRoot}`))) {
            return undefined;
        }
        return { messageId: "libContained", data: { package: name, folder } };
    },
);

export default definePlugin({
    meta: { name: "boundaries" },
    rules: {
        "entry-point-boundary": entryPointBoundary,
        "no-cross-feature": noCrossFeature,
        "tests-through-entrypoints": testsThroughEntrypoints,
        "playground-through-entrypoints": playgroundThroughEntrypoints,
        "lib-contained": libContained,
    },
});
