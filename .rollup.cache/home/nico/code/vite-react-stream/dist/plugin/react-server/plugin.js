import { join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { createLogger, normalizePath, } from "vite";
import { createBuildConfig } from "../build/createBuildConfig.js";
import { checkFilesExist } from "../checkFilesExist.js";
import { getEnv } from "../getEnv.js";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { tryManifest } from "../helpers/tryManifest.js";
import { createPageLoader } from "../loader/createPageLoader.js";
import { DEFAULT_CONFIG, resolveOptions, resolvePages, resolveUserConfig } from "../options.js";
import {} from "../types.js";
import { createWorker } from "../worker/createWorker.js";
import { renderPages } from "../worker/renderPages.js";
import { createHandler } from "./createHandler.js";
let files;
let env;
let worker;
let config;
let cssModules = new Set();
let clientComponents = new Map();
let define;
let buildCssFiles = new Set();
let root = process.cwd();
let nodeRoot = process.env["module_root"] ?? join(root, "node_modules");
let pluginRoot = join(nodeRoot, "vite-plugin-react-server");
let userConfig;
let userOptions;
export async function reactStreamPlugin(options = {}) {
    const timing = {
        start: performance.now(),
    };
    const resolvedOptions = resolveOptions(options, "react-server");
    if (resolvedOptions.type === "error") {
        console.error("[vite-react-stream:server] Error resolving userOptions. Please check your userOptions.");
        throw resolvedOptions.error;
    }
    userOptions = resolvedOptions.userOptions;
    return {
        name: "vite:react-stream",
        meta: {
            timing,
        },
        api: {
            addCssFile(path) {
                buildCssFiles.add(path);
            },
        },
        configResolved(resolvedConfig) {
            if (resolvedConfig.command === "build") {
                timing.configResolved = performance.now();
                console.log("[vite-react-stream] Starting build...");
            }
            config = resolvedConfig;
        },
        async configureServer(server) {
            if (server.config.root) {
                console.log("[vite-react-stream] Root dir changed", server.config.root, server.config.root);
            }
            const activeStreams = new Set();
            // Handle Vite server restarts
            server.ws.on("restart", (path) => {
                console.log("[vite-react-stream] 🔧 Plugin changed, preparing for restart:", path);
                // Close streams with restart message
                for (const res of activeStreams) {
                    res.writeHead(503, {
                        "Content-Type": "text/x-component",
                        "Retry-After": "1",
                    });
                    res.end('{"error":"Server restarting..."}');
                }
                activeStreams.clear();
            });
            server.ws.on("connection", (socket, req) => {
                console.log("[vite-react-stream] hooking up ws connection");
            });
            server.ws.on("listening", () => {
                console.log("[vite-react-stream] hooking up ws listening");
            });
            server.middlewares.use(async (req, res, next) => {
                if (req.headers.accept !== "text/x-component")
                    return next();
                console.log("[vite-react-stream] middleware called");
                try {
                    const handler = await createHandler(req.url ?? "", {
                        Page: userOptions.Page,
                        props: userOptions.props,
                        build: userOptions.build,
                        Html: ({ children }) => children,
                        pageExportName: userOptions.pageExportName,
                        propsExportName: userOptions.propsExportName,
                        moduleBase: userOptions.moduleBase,
                        moduleBasePath: userOptions.moduleBasePath,
                        projectRoot: server.config.root ?? userOptions.projectRoot,
                    }, {
                        cssFiles: Array.from(cssModules),
                        logger: createLogger(),
                        loader: server.ssrLoadModule,
                        moduleGraph: server.moduleGraph,
                    });
                    handler?.stream?.pipe(res);
                }
                finally {
                    res.on("close", () => {
                        console.log("[vite-react-stream] ➖ Stream closed for:", req.url);
                        activeStreams.delete(res);
                    });
                }
            });
        },
        async config(config, configEnv) {
            const resolvedPages = await resolvePages(userOptions.build.pages);
            if (resolvedPages.type === "error") {
                throw resolvedPages.error;
            }
            const { pages } = resolvedPages;
            env = getEnv(config, configEnv);
            define = env.define;
            files = await checkFilesExist(pages, userOptions, config.root ?? userOptions.projectRoot);
            root = config.root ?? userOptions.projectRoot;
            const resolvedConfig = resolveUserConfig("react-server", config, configEnv, userOptions);
            if (resolvedConfig.type === "error") {
                throw resolvedConfig.error;
            }
            userConfig = resolvedConfig.userConfig;
            console.log({
                worker: userOptions.workerPath,
                loader: userOptions.loaderPath,
                manifest: userConfig.build.manifest,
                ssrManifest: userConfig.build.ssrManifest,
            });
            const inputNormalizer = createInputNormalizer({
                root,
                condition: 'react-server',
            });
            const entriesClient = Object.fromEntries([
                ...Object.entries(clientComponents).map(inputNormalizer),
            ]);
            const mapToStubIndex = ([key, value]) => {
                const stub = key.replace(DEFAULT_CONFIG.FILE_REGEX, '');
                const replaceFileName = stub.split(sep).pop();
                const stubIndex = stub.replace(replaceFileName ?? userOptions.pageExportName, 'index');
                return [
                    [stubIndex, 'index.html'],
                    [stub, value],
                ];
            };
            const mapToJSON = ([key, value]) => {
                const stub = key.replace(DEFAULT_CONFIG.FILE_REGEX, '');
                return [stub, value];
            };
            const serverEntries = Object.fromEntries([
                ...Array.from(Object.entries(entriesClient)),
                ...Array.from(files.pageSet.entries()).flatMap(mapToStubIndex),
                ...Array.from(files.propsSet.entries()).map(mapToJSON),
                [userOptions.workerPath, userOptions.workerPath],
                [userOptions.loaderPath, userOptions.loaderPath],
            ]);
            const buildConfig = {
                ...createBuildConfig({
                    condition: 'react-server',
                    input: serverEntries,
                    userConfig: userConfig,
                    userOptions: userOptions,
                    root,
                    nodeRoot,
                    pluginRoot,
                    moduleBase: userOptions.moduleBase,
                    temporaryReferences: new WeakMap(),
                    moduleBaseExceptions: [
                        // no file extension
                        userOptions.workerPath,
                        userOptions.loaderPath,
                        userOptions.clientEntry,
                        ...userOptions.moduleBaseExceptions,
                    ].map(exception => {
                        const normal = normalizePath(exception);
                        const removeExt = normal.replace(/\.[^.]+$/, '');
                        const removeLeadingSlash = removeExt.startsWith('/') ? removeExt.slice(1) : removeExt;
                        return removeLeadingSlash;
                    }),
                }),
                define,
                plugins: config.plugins,
            };
            console.log('RETURNING SERVER CONFIG', { rollup: buildConfig.build?.rollupOptions });
            return buildConfig;
        },
        async buildStart() {
            timing.buildStart = performance.now();
        },
        async closeBundle() {
            if (!config)
                return;
            console.log("RSC CLOSE BUNDLE CALLED");
            if (!files.pageSet.size)
                return;
            timing.renderStart = performance.now();
            const moduleGraph = this.getModuleIds();
            for (const module of moduleGraph) {
                console.log(module);
            }
            try {
                const resolvedServerManifest = tryManifest({
                    root,
                    outDir: userOptions.build.server,
                    ssrManifest: false,
                });
                if (resolvedServerManifest.type === "error") {
                    console.error("[vite-react-stream] Server Build failed, can not build without a server manifest.", resolvedServerManifest.error);
                    return;
                }
                const { manifest: serverManifest } = resolvedServerManifest;
                // get worker path from server manifest
                const workerPath = serverManifest[userOptions.workerPath]?.file ??
                    serverManifest[relative(root, userOptions.workerPath)]?.file ??
                    serverManifest[relative(join(root, userOptions.build.server), userOptions.workerPath)]?.file;
                if (!workerPath) {
                    console.log(serverManifest, userOptions.build.server);
                    throw new Error(`Worker path not found in server manifest, tried: ${userOptions.workerPath}, ${relative(root, userOptions.workerPath)}, ${join(root, userOptions.build.server, userOptions.workerPath)}`);
                }
                console.log("workerPath", workerPath);
                // client
                const resolvedClientManifest = tryManifest({
                    root,
                    outDir: userOptions.build.client,
                    ssrManifest: false,
                });
                if (resolvedClientManifest.type === "error") {
                    console.error("[vite-react-stream] Server Build failed, can not build without a client manifest. Make sure to run the client build before the server build and set `manifest: true` in your vite config.", resolvedClientManifest.error);
                    return;
                }
                const { manifest: clientManifest } = resolvedClientManifest;
                // Create a single worker for all routes
                if (!worker)
                    worker = await createWorker({
                        workerPath: join(root, userOptions.build.server, workerPath),
                        nodePath: process.env["NODE_PATH"] ?? resolve(root, "node_modules"),
                        mode: process.env["NODE_ENV"] === "development"
                            ? "development"
                            : "production",
                    });
                // this is based on the user config - the routes should lead to a page and props but the rendering is agnostic of that
                const routes = Array.from(files.pageMap.keys());
                const indexEntry = clientManifest["index.html"];
                if (!indexEntry) {
                    throw new Error("root /index.html not found");
                }
                const { failedRoutes, filesOutputted } = await renderPages(routes, {
                    pipableStreamOptions: {
                        bootstrapModules: ["/" + indexEntry.file],
                    },
                    outDir: config.build.outDir,
                    clientCss: indexEntry.css?.map((css) => "/" + css) ?? [],
                    pluginOptions: {
                        Page: userOptions.Page,
                        props: userOptions.props,
                        build: userOptions.build,
                        Html: userOptions.Html,
                        pageExportName: userOptions.pageExportName,
                        propsExportName: userOptions.propsExportName,
                        moduleBase: userOptions.moduleBase,
                        moduleBasePath: userOptions.moduleBasePath,
                        moduleBaseURL: userOptions.moduleBaseURL,
                        projectRoot: root,
                    },
                    worker: worker,
                    manifest: clientManifest,
                    loader: createPageLoader({
                        manifest: clientManifest,
                        root: config.root,
                        outDir: config.build.outDir,
                        moduleBase: userOptions.moduleBase,
                        alwaysRegisterServer: false,
                        alwaysRegisterClient: false,
                        registerServer: [],
                        registerClient: Object.keys(resolvedClientManifest).filter((key) => key?.endsWith(".client.tsx") && clientManifest[key].isEntry),
                    }),
                    onCssFile: (path) => buildCssFiles.add(path),
                });
                if (failedRoutes.size) {
                    console.error("[vite-react-stream] Failed to render routes:", failedRoutes);
                }
                if (filesOutputted.length !== routes.length) {
                    console.error("[vite-react-stream] Failed to render routes:", filesOutputted);
                }
                console.log("[vite-react-stream] Render complete");
                console.log("[vite-react-stream] Terminating worker");
                if (worker)
                    await worker.terminate();
                timing.renderEnd = performance.now();
                timing.total = (timing.renderEnd - timing.start) / 1000;
                // Collect stats
                const stats = {
                    htmlFiles: routes.length,
                    clientComponents: clientComponents.size,
                    cssFiles: cssModules.size,
                    totalRoutes: routes.length,
                    timing: {
                        config: ((timing.configResolved ?? 0) - timing.start) / 1000,
                        build: ((timing.buildStart ?? 0) - (timing.configResolved ?? 0)) / 1000,
                        render: ((timing.renderEnd ?? 0) - (timing.renderStart ?? 0)) / 1000,
                        total: (timing.renderEnd ?? 0 - timing.start) / 1000,
                    },
                };
                // Format duration helper
                const formatDuration = (seconds) => {
                    if (seconds < 0.001) {
                        return `${(seconds * 1000000).toFixed(0)}μs`;
                    }
                    if (seconds < 1) {
                        return `${(seconds * 1000).toFixed(0)}ms`;
                    }
                    return `${seconds.toFixed(2)}s`;
                };
                console.log("\n[vite-react-stream] Build Summary:");
                console.log("─".repeat(50));
                console.log(`📄 Generated ${stats.htmlFiles} HTML files`);
                console.log(`🎯 Processed ${stats.clientComponents} client components`);
                console.log(`🎨 Included ${stats.cssFiles} CSS files`);
                console.log(`🛣️  Total routes: ${stats.totalRoutes}`);
                console.log("─".repeat(50));
                console.log("⏱️  Timing:");
                console.log(`  Config:  ${formatDuration(stats.timing.config)}`);
                console.log(`  Build:   ${formatDuration(stats.timing.build)}`);
                console.log(`  Render:  ${formatDuration(stats.timing.render)}`);
                console.log("  ".repeat(12));
                console.log(`  Total:   ${formatDuration(stats.timing.total)}`);
                console.log("─".repeat(50));
            }
            catch (error) {
                console.error("[vite-react-stream] Build failed:", error);
                throw error;
            }
        },
        async buildEnd(error) {
            if (error) {
                console.error("[vite-react-stream] Build error:", error);
            }
            if (worker)
                await worker.terminate();
        },
        handleHotUpdate({ file }) {
            if (file.endsWith(".css")) {
                cssModules.add(file);
            }
        },
        transform(code, id) {
            if ((id.includes(".client") ||
                code.startsWith('"use client"') ||
                code.startsWith("use client")) &&
                !id.includes("node_modules")) {
                console.log("[vite-react-stream] Client component added", id);
                clientComponents.set(id, code);
            }
            return { code };
        },
    };
}
//# sourceMappingURL=plugin.js.map