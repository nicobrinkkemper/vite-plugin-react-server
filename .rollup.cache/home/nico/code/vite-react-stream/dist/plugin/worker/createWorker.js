import { join } from "node:path";
import { Worker } from "node:worker_threads";
export async function createWorker(options) {
    const { workerPath, nodePath, mode, workerOptions } = options;
    console.log("[Worker] Creating worker...");
    console.log("[Worker] Worker path:", workerPath);
    try {
        const worker = new Worker(workerPath, {
            env: {
                NODE_OPTIONS: "",
                NODE_ENV: mode,
                NODE_PATH: nodePath,
            },
            ...workerOptions,
        });
        worker.setMaxListeners(1000);
        // Wait for worker to be ready
        await new Promise((resolve, reject) => {
            worker.once("message", (message) => {
                if (message.type === "READY") {
                    resolve();
                }
            });
            worker.once("error", reject);
        });
        return worker;
    }
    catch (error) {
        console.error("[Worker] Startup error:", error);
        throw error;
    }
}
//# sourceMappingURL=createWorker.js.map