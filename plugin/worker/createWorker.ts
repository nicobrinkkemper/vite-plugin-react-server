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
    }
  } = options;

  // Ensure consistent NODE_ENV between main thread and worker
  const isTestEnv = process.env['VITEST'] || process.env['NODE_ENV'] === 'test';
  const nodeEnv = isTestEnv ? 'development' : mode;

  const env = {
    ...process.env,
    NODE_ENV: nodeEnv,
    NODE_PATH: nodePath,
    // Clear any inherited conditions for worker
    NODE_OPTIONS: reverseCondition ? 
      (condition === 'react-server' ? '--conditions=react-client' : '--conditions=react-server') 
      : process.env['NODE_OPTIONS']
  };
  const maxRetries = 3;
  for (let tries = 0; tries < maxRetries; tries++) {
    try {
      const worker = new Worker(workerPath.startsWith('/') ? workerPath : join(projectRoot, workerPath), {
        env,
        // Increase resource limits for stream handling
        resourceLimits: resourceLimits
      });

      worker.setMaxListeners(maxListeners);

      // Wait for worker to be ready and verify environment
      const ready = await Promise.race([
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Worker startup timeout: ${workerPath}`)), 5000);
        }),
        new Promise((resolve, reject) => {
          worker.once('message', (msg) => {
            if (msg.type === 'READY') {
              if(msg.env === nodeEnv) {
                resolve(true);
              } else {
                reject(new Error(`Worker environment mismatch: expected ${nodeEnv}, got ${msg.env}`));
              }
            } else if (msg.type === 'ERROR') {
              reject(new Error(msg.error));
            }
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
