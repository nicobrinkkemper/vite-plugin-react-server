import path, { join, relative, sep } from "node:path";
import { DEFAULT_CONFIG } from "../options.js";
import { existsSync, realpathSync } from "node:fs";
import { normalizePath as normalizePathVite } from "vite";
export const createInputNormalizer = ({ root = process.cwd(), nodeRoot = process["env"]["module_root"] ??
    process.cwd() + sep + "node_modules", pluginRoot = join(nodeRoot, "vite-plugin-react-server"), temporaryReferences = new WeakMap(), condition = "react-server", } = {}) => {
    // Resolve real paths accounting for symlinks
    const resolvedRoot = realpathSync(root);
    const resolvedNodeRoot = realpathSync(nodeRoot);
    const resolvedPluginRoot = realpathSync(pluginRoot);
    // if the path is in the temporaryReferences, we can return the cached value
    const getTemporaryReference = (key) => {
        return temporaryReferences.get(key);
    };
    const setTemporaryReference = (key, value) => {
        temporaryReferences.set(key, value);
    };
    const dirDistance = relative(root, nodeRoot).split(sep).length;
    const dirDistanceString = dirDistance > 0 ? "../".repeat(dirDistance - 1) : "";
    console.log("debug", { root, nodeRoot, dirDistance, dirDistanceString });
    // rules of keys and rollup:
    // 1. keys must be strings
    // 2. represent the output file module name, 
    // 3. can be neither absolute nor relative path, should not start with /, ../ or end with extension
    const normalizeKey = (key) => {
        key = key.replace(DEFAULT_CONFIG.FILE_REGEX, "");
        while (key.startsWith('/')) {
            key = key.slice(1);
        }
        return key;
    };
    // rules of paths:
    // 1. paths must be strings
    // 2. paths must be relative to the root
    const normalizePath = (path) => {
        if (!path)
            return path;
        try {
            // Resolve real path if it exists
            const realPath = existsSync(path) ? realpathSync(path) : path;
            // Replace resolved paths
            path = realPath
                .replace(resolvedPluginRoot, "/node_modules/vite-plugin-react-server")
                .replace(resolvedRoot, "/")
                .replace(resolvedNodeRoot, "/node_modules");
            if (!path.startsWith('/')) {
                path = '/' + path;
            }
            return normalizePathVite(path);
        }
        catch (err) {
            // Fallback to regular path normalization if realpath fails
            path = path
                .replace(pluginRoot, "/node_modules/vite-plugin-react-server")
                .replace(root, "/")
                .replace(nodeRoot, "/node_modules");
            if (!path.startsWith('/')) {
                path = '/' + path;
            }
            return normalizePathVite(path);
        }
    };
    // rules of user input:
    // 1. can be normal vite or rollup input that should merge with our input.
    // 2. our input is in the form of a structured object, but user could be any valid rollup input.
    // 3. we need to normalize the user input to our input format.
    // 4. to reduce complexity, we map over all the keys and values as entries and normalize them.
    // exceptions: package names `plugin-vite-react-server/worker` could be valid if resolved from configured module_root
    // exceptions: simple relative references ../../../ is totally valid and useful in tests
    return (input) => {
        if (typeof input === "string") {
            return [normalizeKey(input), normalizePath(input)];
        }
        if (!Array.isArray(input)) {
            throw new Error("input must be an array of [key, value]");
        }
        if (input.length !== 2) {
            throw new Error("input must be an array of [key, value]");
        }
        let [key, value] = input;
        if (typeof key === "object" && key !== null) {
            const tempRef = getTemporaryReference(key);
            if (tempRef && typeof tempRef === "string") {
                key = tempRef;
            }
            const tempRefValue = getTemporaryReference(value);
            if (tempRefValue && typeof tempRefValue === "string") {
                value = tempRefValue;
            }
            console.log("debug", { key, value });
            return [key, value];
        }
        if (typeof key === "number" || !isNaN(Number(key))) {
            // for arrays, we derive the key from the value
            key = normalizeKey(value);
        }
        else if (typeof key === "string") {
            // lets apply the rules of keys first
            key = normalizeKey(key);
        }
        else {
            throw new Error("key must be a string or number");
        }
        if (typeof value === "string") {
            value = normalizePath(value);
        }
        else {
            throw new Error("value must be a string");
        }
        if (!value.includes(".") && value.startsWith("/")) {
            if (condition === "react-client") {
                // the user gave us the route to a directory, we can resolve the dev index.html
                // to get the intial assets and buld the final html after the build is complete
                key = key.endsWith("/") ? key + "index" : key + "/index";
                // since the index.html is at the root, we always resolve it to the root
                value = "index.html";
            }
            else if (condition === "react-server") {
                // for server, we need to resolve the index.html to the root
                key = key.endsWith("/") ? key + "index" : key + "/index";
                value = "index.html";
            }
            else {
                throw new Error(`invalid condition: ${condition}`);
            }
        }
        console.log("debug", root, { key, value });
        if (typeof key === "object" && key !== null) {
            setTemporaryReference(key, value);
        }
        const absolutePath = join(resolvedRoot, value);
        // Check file exists, handling symlinks
        if (!existsSync(absolutePath)) {
            const tryRelative = relative(resolvedRoot, absolutePath);
            if (!existsSync(tryRelative)) {
                // Try resolving as symlink
                try {
                    const realPath = realpathSync(absolutePath);
                    if (existsSync(realPath)) {
                        value = relative(resolvedRoot, realPath);
                        console.log('symlink exists', realPath);
                    }
                    else {
                        throw new Error(`file does not exist: ${key} -> ${absolutePath}, from ${resolvedRoot}`);
                    }
                }
                catch {
                    throw new Error(`file does not exist: ${key} -> ${absolutePath}, from ${resolvedRoot}`);
                }
            }
            else {
                value = tryRelative;
                console.log('relative exists', absolutePath);
            }
        }
        else {
            // Resolve any symlinks in the path
            try {
                const realPath = realpathSync(absolutePath);
                value = relative(resolvedRoot, realPath);
                console.log('file exists (resolved symlink)', realPath);
            }
            catch {
                console.log('file exists', absolutePath);
            }
        }
        console.log('debug', { key, value });
        return [key, value];
    };
};
//# sourceMappingURL=inputNormalizer.js.map