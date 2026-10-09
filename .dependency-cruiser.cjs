const PACKAGES_ROOT = "src";
const PACKAGE_PATTERN = "(markdownInline|markdownInlineHost)";

const packageRoot = `${PACKAGES_ROOT}/${PACKAGE_PATTERN}`;

const FEATURE_FOLDER = "^src/([^/]+)/";
const NON_FEATURE_FOLDERS = "lib|commands";

module.exports = {
    forbidden: [
        {
            name: "no-cross-feature",
            severity: "error",
            comment:
                "Feature folders under src/ do not import sibling folders; put shared code in src/lib and wire commands from src/commands",
            from: { path: FEATURE_FOLDER, pathNot: `^src/(${NON_FEATURE_FOLDERS})/` },
            to: {
                path: FEATURE_FOLDER,
                pathNot: [`^src/$1/`, `^src/(${NON_FEATURE_FOLDERS})/`],
            },
        },
        {
            name: "entry-point-boundary",
            severity: "error",
            from: { path: `^${PACKAGES_ROOT}/(${PACKAGE_PATTERN})/` },
            to: {
                path: `^${packageRoot}/.+/`,
                pathNot: `^${PACKAGES_ROOT}/$1/`,
            },
        },
        {
            name: "entry-point-boundary",
            severity: "error",
            from: { pathNot: `^${packageRoot}/` },
            to: { path: `^${packageRoot}/.+/` },
        },
        {
            name: "tests-through-entrypoints",
            severity: "error",
            from: { path: `^${PACKAGES_ROOT}/(${PACKAGE_PATTERN})/tests/` },
            to: {
                path: `^${packageRoot}/.+/`,
                pathNot: `^${PACKAGES_ROOT}/$1/tests/`,
            },
        },
        {
            name: "playground-through-entrypoints",
            severity: "error",
            from: { path: `^${PACKAGES_ROOT}/markdownInline/playground/` },
            to: {
                path: `^${PACKAGES_ROOT}/markdownInline/.+/`,
                pathNot: `^${PACKAGES_ROOT}/markdownInline/playground/`,
            },
        },
        {
            name: "lib-contained",
            severity: "error",
            comment: "markdownInline lib/ stays inside the package except src/lib",
            from: { path: "^src/markdownInline/lib/" },
            to: {
                path: "^src/",
                pathNot: ["^src/markdownInline/", "^src/lib/"],
            },
        },
        {
            name: "no-circular",
            severity: "error",
            from: { path: `^${packageRoot}/` },
            to: { circular: true },
        },
    ],
    options: {
        doNotFollow: { path: "node_modules" },
        exclude: {
            path: "(node_modules|playground/dist|\\.(css|ttf|woff2?|svg|png|md)$)",
        },
        tsPreCompilationDeps: true,
        enhancedResolveOptions: {
            exportsFields: ["exports"],
            conditionNames: ["import", "require", "node", "default", "types"],
            extensions: [".ts", ".tsx", ".mts", ".mjs", ".js", ".cjs", ".json"],
        },
    },
};
