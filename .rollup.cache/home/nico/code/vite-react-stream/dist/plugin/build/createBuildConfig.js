import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { mergeInputs } from "./mergeInputs.js";
export function createClientBuildConfig({ input, userConfig, inputNormalizer }) {
    const { input: inputConfig, ...restRollupOptions } = userConfig.build.rollupOptions ?? {};
    return {
        ...userConfig,
        build: {
            ...userConfig.build,
            rollupOptions: {
                ...restRollupOptions,
                input: mergeInputs(input, inputConfig, inputNormalizer),
            }
        }
    };
}
export const createServerBuildConfig = ({ input, userConfig, inputNormalizer }) => {
    const { output, input: inputConfig, ...restRollupOptions } = userConfig.build.rollupOptions ?? {};
    return {
        ...userConfig,
        build: {
            ...userConfig.build,
            rollupOptions: {
                input: mergeInputs(input, inputConfig, inputNormalizer),
                output: {
                    format: "esm",
                    preserveModules: true,
                    hoistTransitiveImports: false,
                    esModule: true,
                    entryFileNames: "[name].js",
                    chunkFileNames: "[name].js",
                    assetFileNames: "[name][extname]",
                    ...output,
                },
                ...restRollupOptions,
            },
        },
    };
};
export function validateModuleBase(input, moduleBase, moduleBaseExceptions) {
    for (const [key, value] of Object.entries(input)) {
        const isException = moduleBaseExceptions.includes(key) || ['/index', 'index'].includes(key);
        if (!key.includes('/'))
            return;
        if (value.startsWith('//')) {
            throw new Error(`Path shouldn't start with //`);
        }
        if (!key.startsWith(moduleBase) && !isException) {
            throw new Error(`Invalid input: ${key} does not start with ${moduleBase}. If this is a valid key, add it to moduleBaseExceptions otherwise put the file in the ${moduleBase} directory. Exception: ${moduleBaseExceptions.join(', ')}`);
        }
        if (!value.startsWith('/' + moduleBase) && !isException) {
            throw new Error(`Invalid value: ${value} does not start with ${moduleBase}. If this is a valid path, add it to moduleBaseExceptions otherwise put the file in the ${moduleBase} directory. Exception: ${moduleBaseExceptions.join(', ')}`);
        }
    }
}
export const createBuildConfig = ({ condition, root, input, userOptions, userConfig, moduleBaseExceptions, pluginRoot, nodeRoot, temporaryReferences, moduleBase }) => {
    const inputNormalizer = createInputNormalizer({
        condition,
        root,
        pluginRoot,
        nodeRoot,
        temporaryReferences
    });
    input = Object.fromEntries(Object.entries(userConfig.build.rollupOptions.input).concat(Object.entries(input)).map(inputNormalizer));
    validateModuleBase(input, moduleBase, moduleBaseExceptions);
    if (condition !== 'react-server') {
        return createClientBuildConfig({
            input,
            userConfig,
            inputNormalizer
        });
    }
    return createServerBuildConfig({
        input,
        userConfig,
        inputNormalizer
    });
};
//# sourceMappingURL=createBuildConfig.js.map