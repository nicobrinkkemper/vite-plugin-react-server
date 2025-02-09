import { Worker } from "node:worker_threads";
import { getMode, getNodePath } from "../config/getPaths.js";
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

  if(nodeOptions === '--conditions=') nodeOptions = '';

  const maxRetries = 3;
  const timeout = 5000;
  
  for (let tries = 0; tries < maxRetries; tries++) {
    try {
      
      const worker = new Worker(workerPath, {
        env: {
          NODE_OPTIONS: nodeOptions,
          NODE_ENV: mode,
          NODE_PATH: nodePath,
        },
        ...workerOptions,
      });
      worker.setMaxListeners(maxListeners);
      
      const ready = await Promise.race([
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Worker startup timeout')), timeout)
        ),
        new Promise((resolve, reject) => {
          worker.once('message', msg => {
            if (msg.type === 'READY') resolve(true);
          });
          worker.once('error', reject);
        })
      ]);
      
      if (ready) return worker;
    } catch (error) {
      console.warn(`Worker startup attempt ${tries + 1} failed:`, error);
      if (tries === maxRetries - 1) throw error;
    }
  }
  throw new Error('Failed to start worker after retries');
}
