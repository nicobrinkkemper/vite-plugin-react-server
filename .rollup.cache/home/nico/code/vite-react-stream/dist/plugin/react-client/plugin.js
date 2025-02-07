import { createBuildConfig } from "../build/createBuildConfig.js";
import { resolveOptions, resolvePages, resolveUserConfig, } from "../options.js";
import { join } from "node:path";
import { sep } from "node:path";
import { checkFilesExist } from "../checkFilesExist.js";
let root = process.cwd();
let nodeRoot = process['env']['module_root'] ?? join(root, "node_modules");
let pluginRoot = join(nodeRoot, "vite-plugin-react-server");
export function reactStreamPlugin(options) {
    const resolvedOptions = resolveOptions(options, "react-client");
    if (resolvedOptions.type === "error") {
        throw resolvedOptions.error;
    }
    const { userOptions } = resolvedOptions;
    return {
        name: "vite:react-stream",
        async config(config, configEnv) {
            root = config.root ?? process.cwd();
            const resolvedPages = await resolvePages(userOptions.build.pages);
            if (resolvedPages.type === "error") {
                throw resolvedPages.error;
            }
            const { pages } = resolvedPages;
            const files = await checkFilesExist(pages, {
                Page: userOptions.Page,
                props: userOptions.props,
            }, userOptions.projectRoot);
            const resolvedConfig = resolveUserConfig("react-client", config, configEnv, userOptions);
            if (resolvedConfig.type === "error") {
                throw resolvedConfig.error;
            }
            const { userConfig } = resolvedConfig;
            console.log('RETURNING CLIENT CONFIG', { rollup: userConfig.build.rollupOptions });
            return createBuildConfig({
                condition: 'react-client',
                input: userConfig.build.rollupOptions.input,
                userOptions,
                userConfig,
                moduleBaseExceptions: userOptions.moduleBaseExceptions.includes('index') ? userOptions.moduleBaseExceptions : [...userOptions.moduleBaseExceptions ?? null, 'index'],
                root: config.root ?? process.cwd(),
                nodeRoot,
                pluginRoot,
                moduleBase: userOptions.moduleBase,
                temporaryReferences: new WeakMap(),
            });
        },
    };
}
//# sourceMappingURL=plugin.js.map