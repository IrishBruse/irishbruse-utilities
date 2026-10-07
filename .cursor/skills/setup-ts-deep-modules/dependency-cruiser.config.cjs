const PACKAGES_ROOT = "src/packages";
const PACKAGE_PATTERN = "[^/]+";

const packageRoot = `${PACKAGES_ROOT}/${PACKAGE_PATTERN}`;

module.exports = {
    forbidden: [
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
            name: "no-circular",
            severity: "error",
            from: { path: `^${packageRoot}/` },
            to: { circular: true },
        },
        {
            name: "layering",
            comment: "Which packages may depend on which. Leave severity on ignore until this repo fills the rule in.",
            severity: "ignore",
            from: { path: "^$" },
            to: { path: "^$" },
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
