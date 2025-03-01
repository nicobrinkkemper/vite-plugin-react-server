import { Worker, type ResourceLimits } from "node:worker_threads";
import { getMode, getNodePath } from "../config/getPaths.js";
import { getCondition } from "../config/getCondition.js";
import { join } from "node:path";
type CreateWorkerOptions = {
  projectRoot?: string;
  condition?: "react-server" | "react-client";
  nodePath?: string;
  nodeOptions?: string;
  mode?: "production" | "development";
  reverseCondition?: boolean;
  maxListeners?: number;
  workerPath: string;
  resourceLimits?: ResourceLimits;
  typescript?: boolean;
};

export async function createWorker(options: CreateWorkerOptions) {
  const {
    projectRoot = process.cwd(),
    nodePath = getNodePath(projectRoot),
    condition = getCondition(),
    reverseCondition = true,
    maxListeners = 100,
    mode = getMode(),
    workerPath,
    resourceLimits = {
      maxOldGenerationSizeMb: 512,
      maxYoungGenerationSizeMb: 128,
    },
  } = options;

  // Ensure consistent NODE_ENV between main thread and worker
  const isTestEnv = process.env["VITEST"] || process.env["NODE_ENV"] === "test";
  const nodeEnv = isTestEnv ? "development" : mode;

  const env = {
    ...process.env,
    NODE_ENV: nodeEnv,
    NODE_PATH: nodePath,
    NODE_OPTIONS: `${
      reverseCondition
        ? condition === "react-server"
          ? process.env["NODE_OPTIONS"]?.includes("react-server")
            ? process.env["NODE_OPTIONS"]?.replace("react-server", "react-client")
            : `${process.env["NODE_OPTIONS"] ?? ''} --conditions=react-client`
          : process.env["NODE_OPTIONS"]?.includes("react-client")
            ? process.env["NODE_OPTIONS"]?.replace("react-client", "react-server")
            : `${process.env["NODE_OPTIONS"] ?? ''} --conditions=react-server`
        : process.env["NODE_OPTIONS"]
    }`,
  };

  // Create worker with proper environment
  const worker = new Worker(
    workerPath.startsWith("/") ? workerPath : './' + workerPath,
    {
      env,
      resourceLimits,
    }
  );

  worker.setMaxListeners(maxListeners);

  // Wait for worker to be ready
  return await new Promise<Worker>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Worker ready timeout'));
    }, 5000);

    worker.once("message", (msg) => {
      if (msg.type === "READY" && msg.env === nodeEnv) {
        clearTimeout(timeout);
        resolve(worker);
      }
    });

    worker.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
