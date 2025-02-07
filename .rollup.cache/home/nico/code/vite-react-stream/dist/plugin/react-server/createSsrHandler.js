import { dirname, join, resolve } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import {} from "vite";
import { DEFAULT_CONFIG } from "../options.js";
import { createHandler } from "./createHandler.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
export function createSsrHandler(options, server, clientComponents) {
    const worker = new Worker(options?.workerPath
        ? resolve(server.config.root, options?.workerPath)
        : DEFAULT_CONFIG.WORKER_PATH, {
        env: {
            NODE_OPTIONS: "--conditions ''",
            VITE_LOADER_PATH: resolve(server.config.cacheDir, "react-stream/worker/loader.js"),
        },
    });
    return async function handleSsrRequest(req, res, next) {
        if (!req.url ||
            req.url.startsWith("/@") ||
            (req.url.includes(".") && !req.url.endsWith(".html"))) {
            return next();
        }
        try {
            const result = await createHandler(req.url ?? "", {
                Page: options.Page,
                props: options.props,
                build: options.build,
                Html: options.Html,
                pageExportName: options.pageExportName,
                propsExportName: options.propsExportName,
                moduleBase: options.moduleBase,
                moduleBasePath: options.moduleBasePath,
                projectRoot: server.config.root,
            }, {
                loader: server.ssrLoadModule.bind(server),
                moduleGraph: server.moduleGraph,
            });
            const moduleBasePath = join(server.config.cacheDir, options.moduleBasePath);
            const htmlOutputPath = join(server.config.cacheDir, server.config.build.outDir, req.url, "index.html");
            if (result.type !== "success") {
                throw new Error(result.type === "error" ? String(result.error) : "Skipped");
            }
            // Collect RSC stream data
            const rscData = await new Promise((resolve, reject) => {
                let data = "";
                if (!result.stream) {
                    resolve(data);
                    return;
                }
                const writable = new Writable({
                    write(chunk, _, callback) {
                        data += chunk;
                        callback();
                    },
                    final(callback) {
                        resolve(data);
                        callback();
                    },
                });
                result.stream.pipe(writable);
                writable.on("error", reject);
            });
            // Get HTML from worker
            const html = await new Promise((resolve, reject) => {
                worker.postMessage({
                    type: "RSC_CHUNK",
                    id: req.url ?? "/",
                    chunk: rscData,
                    moduleBasePath,
                    moduleBaseURL: options.moduleBaseURL,
                    // Don't need file paths in dev mode
                    outDir: "",
                    htmlOutputPath: "",
                    pipableStreamOptions: {
                        bootstrapModules: ["/dist/client.js"],
                    },
                });
                worker.once("message", (msg) => {
                    if (msg.type === "ERROR") {
                        const message = msg.error instanceof Error
                            ? msg.error.message
                            : String(msg.error);
                        reject(new Error(message, { cause: msg }));
                    }
                    else if (msg.type === "HTML") {
                        // In dev, content will be the HTML string
                        resolve(msg.content);
                    }
                });
            });
            res.setHeader("Content-Type", "text/html");
            res.end(html);
        }
        catch (error) {
            next(error);
        }
    };
}
//# sourceMappingURL=createSsrHandler.js.map