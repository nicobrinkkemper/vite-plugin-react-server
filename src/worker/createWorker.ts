import { resolve } from "node:path";
import { Worker } from "node:worker_threads";

export async function createWorker(
  projectRoot: string,
  outDir: string,
  fileName: string,
  mode: "production" | "development"
) {
  console.log("[Worker] Creating worker...");
  const workerPath = resolve(projectRoot, outDir, fileName);
  console.log("[Worker] Worker path:", workerPath);

  try {
    const worker = new Worker(workerPath, {
      env: {
        NODE_OPTIONS: "",
        NODE_PATH: resolve(projectRoot, "node_modules"),
        NODE_ENV: mode,
      },
    });
    worker.setMaxListeners(1000);

    // Wait for worker to be ready
    await new Promise<void>((resolve, reject) => {
      worker.once("message", (message) => {
        if (message.type === "READY") {
          resolve();
        }
      });
      worker.once("error", reject);
    });

    return worker;
  } catch (error) {
    console.error("[Worker] Startup error:", error);
    throw error;
  }
}
