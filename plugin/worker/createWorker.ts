import { join, basename } from "node:path";
import { Worker } from "node:worker_threads";
import { getMode, getNodePath } from "../config/getPaths.js";
import { resolveFilePath } from '../helpers/resolveFilePath.js';
import { getCondition } from "../config/getCondition.js";

type CreateWorkerOptions = {
  projectRoot?: string;
  condition?: "react-server" | "react-client";
  nodePath?: string;
  nodeOptions?: string;
  mode?: "production" | "development";
  workerOptions?: WorkerOptions;
  reverseCondition?: boolean;
  maxListeners?: number;
  workerPath: string;
};
export async function createWorker(options: CreateWorkerOptions) {
  let {
    projectRoot = process.cwd(),
    nodePath = getNodePath(projectRoot),
    condition = getCondition(),
    reverseCondition = true,
    nodeOptions = reverseCondition ? condition === "react-server"
        ? "--conditions=react-client"
        : "--conditions=react-server"
      : condition === "react-server" ? "--conditions=react-server"
      : "--conditions=react-client",
    mode = getMode(),
    workerOptions,
    maxListeners = 1000,
    workerPath,
  } = options;

  console.log("[Worker] Creating worker...");
  console.log("[Worker] Worker path:", workerPath);
  if(nodeOptions === '--conditions=') nodeOptions = '';

  try {
    console.log("[Worker] Resolved path:", workerPath, mode, nodeOptions, nodePath);
    
    const worker = new Worker(workerPath, {
      env: {
        NODE_OPTIONS: nodeOptions,
        NODE_ENV: mode,
        NODE_PATH: nodePath,
      },
      ...workerOptions,
    });
    worker.setMaxListeners(maxListeners);

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
