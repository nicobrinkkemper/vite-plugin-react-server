import { resolve as resolvePath } from "node:path";
import { load
// @ts-ignore
 } from "react-server-dom-esm/node-loader";
import { registerClientReference, registerServerReference,
// @ts-ignore
 } from "react-server-dom-esm/server.node";
import { createNormalizedRelativePath } from "../helpers/normalizedRelativePath.js";
export const createDefaultLoader = ({ id, registerServer, registerClient, alwaysRegisterServer = false, alwaysRegisterClient = false, }) => {
    const mapper = ([key, value]) => {
        try {
            if (registerClient?.includes(key) ||
                (alwaysRegisterClient && typeof value === "function")) {
                return [key, registerClientReference(value, id, key)];
            }
            if (registerServer?.includes(key) ||
                (alwaysRegisterServer && typeof value === "function")) {
                return [key, registerServerReference(value, id, key)];
            }
            return [key, value];
        }
        catch (e) {
            console.error("[RSC] Error registering reference:", key, value, e);
            return [key, value];
        }
    };
    return async (url) => Object.fromEntries(Object.entries(await import(url)).map(mapper));
};
export const createPageLoader = ({ manifest, root, outDir, moduleBase, registerServer, registerClient, alwaysRegisterServer, alwaysRegisterClient, }) => {
    const pathNormalizer = createNormalizedRelativePath({
        root,
        outDir,
        moduleBase,
        noLeadingSlash: true,
        noTrailingSlash: true,
        moduleBaseExceptions: [],
    });
    return async (id) => {
        const normalizedId = pathNormalizer(id);
        const entry = normalizedId in manifest
            ? manifest[normalizedId]
            : Object.values(manifest).find((entry) => entry.file === normalizedId);
        if (!entry) {
            throw new Error(`Could not find manifest entry for ${id}, ${normalizedId} from ${root}`);
        }
        const loaderResult = await load(resolvePath(root, outDir, entry.file), { format: "module" }, createDefaultLoader({
            id,
            registerServer,
            registerClient,
            alwaysRegisterServer,
            alwaysRegisterClient,
        }));
        return loaderResult;
    };
};
//# sourceMappingURL=createPageLoader.js.map