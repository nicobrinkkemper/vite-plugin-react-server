import { join, resolve as resolvePath } from "node:path";
import { Transform } from "node:stream";
import { createHandler } from "../react-server/createHandler.js";
export async function renderPages(routes, options) {
    const destinationRoot = resolvePath(options.pluginOptions.projectRoot, options.outDir);
    const failedRoutes = new Map();
    const moduleBasePath = join(destinationRoot, options.pluginOptions.moduleBasePath);
    const moduleBaseURL = options.pluginOptions.moduleBaseURL;
    const htmlRoot = resolvePath(options.pluginOptions.projectRoot, options.pluginOptions.build?.client ?? options.outDir);
    const filesOutputted = [];
    options.worker.on("message", (msg) => {
        switch (msg.type) {
            case "ERROR":
                console.error("[RenderPages] Worker error:", msg.error);
                break;
            case "HTML":
                filesOutputted.push(msg.outputPath);
                if (filesOutputted.length === routes.length) {
                    renderPromises.push(new Promise((resolve) => {
                        options.worker.removeAllListeners();
                        options.worker.terminate();
                        resolve();
                    }));
                }
                break;
            default:
                break;
        }
    });
    const pipableStreamOptions = options.pipableStreamOptions ?? {};
    // Create promises for each route in the batch
    const renderPromises = routes.map(async (route) => {
        try {
            // Wait for handler creation
            const result = await createHandler(route, options.pluginOptions, {
                loader: options.loader,
                manifest: options.manifest,
            });
            if (result.type !== "success") {
                return;
            }
            const htmlOutputPath = join(htmlRoot, route, "index.html");
            // Create a promise that resolves when the worker completes
            await new Promise((resolve, reject) => {
                // Pipe RSC stream to worker
                const transform = new Transform({
                    transform(chunk, _encoding, callback) {
                        // Send raw chunk
                        options.worker.postMessage({
                            type: "RSC_CHUNK",
                            id: route,
                            chunk: chunk,
                            moduleBasePath,
                            moduleBaseURL,
                            htmlOutputPath: htmlOutputPath,
                            outDir: options.outDir,
                            pipableStreamOptions,
                        });
                        callback();
                    },
                    flush(callback) {
                        options.worker.postMessage({
                            type: "RSC_END",
                            id: route,
                        });
                        callback();
                    },
                });
                // Listen for worker response for this route
                const messageHandler = (msg) => {
                    if (msg.route === route) {
                        if (msg.type === "ERROR") {
                            options.worker.removeListener("message", messageHandler);
                            reject(new Error(msg.error));
                        }
                        else if (msg.type === "HTML") {
                            options.worker.removeListener("message", messageHandler);
                            resolve();
                        }
                    }
                };
                options.worker.on("message", messageHandler);
                result.stream?.pipe(transform);
            });
        }
        catch (error) {
            failedRoutes.set(route, error);
        }
    });
    // Wait for all routes to complete
    await Promise.all(renderPromises);
    return {
        failedRoutes,
        filesOutputted
    };
}
//# sourceMappingURL=renderPages.js.map